package dev.mokouliszt.goldras

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.collect
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit
import kotlin.math.abs

/**
 * 通知は「重要イベント時のみ」。
 * 1年保有が前提なので、日々の値動きそのものは材料にしない。
 *
 * 段階1（通信のみ・安価）: 価格の急変と地合いの転換を機械的に検出する。
 * 段階2（Codex）: 段階1が何か掴んだ日だけ、ニュースの裏取りに走る。
 *   ここを毎回走らせると ChatGPT の枠を無駄に食うので、条件付きにしている。
 */
object Alerts {

    const val CHANNEL = "goldras_events"
    private const val WORK = "goldras-watch"

    fun schedule(context: Context) {
        val on = Store(context).settings().optBoolean("alerts", true)
        val wm = WorkManager.getInstance(context.applicationContext)
        if (!on) { wm.cancelUniqueWork(WORK); return }
        val req = PeriodicWorkRequestBuilder<WatchWorker>(6, TimeUnit.HOURS)
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .setInitialDelay(30, TimeUnit.MINUTES)
            .build()
        wm.enqueueUniquePeriodicWork(WORK, ExistingPeriodicWorkPolicy.UPDATE, req)
    }

    fun notify(context: Context, id: Int, title: String, body: String, url: String?) {
        val nm = context.getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CHANNEL) == null) {
            nm.createNotificationChannel(
                NotificationChannel(CHANNEL, "重要イベント", NotificationManager.IMPORTANCE_DEFAULT).apply {
                    description = "保有銘柄と金の地合いに関する、判断に影響する変化だけを通知します"
                })
        }
        val intent = Intent(context, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
            .also { if (url != null) it.putExtra("url", url) }
        val pi = PendingIntent.getActivity(
            context, id, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val n = NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(android.R.drawable.stat_notify_sync)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setContentIntent(pi)
            .setAutoCancel(true)
            .build()
        runCatching { NotificationManagerCompat.from(context).notify(id, n) }
    }
}

class WatchWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {

    override suspend fun doWork(): Result {
        val ctx = applicationContext
        val store = Store(ctx)
        if (!store.settings().optBoolean("alerts", true)) return Result.success()

        // ---- 段階1: 価格から機械的に検出 ----
        val snap = runCatching { MarketData.snapshot(store.symbols(), store.benchmarks()) }
            .getOrNull() ?: return Result.retry()
        val prev = store.snapshot()
        store.saveSnapshot(snap)
        store.gradePredictions()

        val threshold = store.settings().optDouble("moveThreshold", 7.0)
        val quotes = snap.optJSONObject("quotes") ?: JSONObject()
        val triggers = ArrayList<String>()
        val today = java.text.SimpleDateFormat("yyyyMMdd", java.util.Locale.US)
            .format(java.util.Date())

        for (t in quotes.keys()) {
            val chg = quotes.optJSONObject(t)?.optDouble("chg1d", Double.NaN) ?: continue
            if (chg.isNaN() || abs(chg) < threshold) continue
            val key = "move-$t-$today"
            if (store.wasNotified(key)) continue
            store.markNotified(key)
            triggers.add(t)
            val dir = if (chg > 0) "急騰" else "急落"
            Alerts.notify(ctx, key.hashCode(),
                "$t が$dir ${String.format("%+.1f", chg)}%",
                "1日で閾値(${threshold.toInt()}%)を超えて動きました。材料を確認してください。", null)
        }

        // 金そのものの地合い転換（200日線をまたいだ日だけ）
        val g = snap.optJSONObject("bench")?.optJSONObject("gold")
        val pg = prev.optJSONObject("bench")?.optJSONObject("gold")
        if (g != null && pg != null) {
            val now = g.optDouble("last", Double.NaN) - g.optDouble("ma200", Double.NaN)
            val before = pg.optDouble("last", Double.NaN) - pg.optDouble("ma200", Double.NaN)
            if (!now.isNaN() && !before.isNaN() && now * before < 0) {
                val key = "regime-$today"
                if (!store.wasNotified(key)) {
                    store.markNotified(key)
                    triggers.add("GOLD")
                    Alerts.notify(ctx, key.hashCode(),
                        if (now > 0) "金が200日線を上抜け" else "金が200日線を下抜け",
                        "地合いの転換候補です。保有全体の判断を見直す局面かもしれません。", null)
                }
            }
        }

        // ---- 段階2: 何か動いた日だけ Codex にニュースを確認させる ----
        if (triggers.isEmpty()) return Result.success()
        val auth = CodexAuth(ctx)
        if (!auth.isLoggedIn()) return Result.success()

        val codex = CodexClient(auth) { store.workspace }
        val s = store.settings()
        val ctxBlock = Prompts.contextBlock(
            store.universe(), snap, store.fundamentals(), store.macro())
        val buf = StringBuilder()
        runCatching {
            codex.run(
                Prompts.watch(ctxBlock),
                listOf(Msg("user", "直近の材料を確認し、通知に値するものだけをJSONで返してください。対象: " + triggers.joinToString(", "))),
                s.optString("model"), "medium",
            ).catch { }.collect { ev -> if (ev is CodexEvent.Delta) buf.append(ev.text) }
        }
        val parsed = runCatching {
            val text = buf.toString()
            val a = text.indexOf('{'); val b = text.lastIndexOf('}')
            if (a < 0 || b <= a) null else JSONObject(text.substring(a, b + 1))
        }.getOrNull() ?: return Result.success()

        val events = parsed.optJSONArray("events") ?: JSONArray()
        for (i in 0 until events.length()) {
            val e = events.optJSONObject(i) ?: continue
            if (e.optString("severity") != "high") continue
            val key = "ai-" + e.optString("key").ifBlank { e.optString("title").hashCode().toString() }
            if (store.wasNotified(key)) continue
            store.markNotified(key)
            Alerts.notify(ctx, key.hashCode(),
                "${e.optString("ticker")}: ${e.optString("title")}",
                e.optString("detail"),
                e.optString("url").takeIf { it.isNotBlank() && it != "null" })
        }
        return Result.success()
    }
}
