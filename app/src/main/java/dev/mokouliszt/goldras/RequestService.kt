package dev.mokouliszt.goldras

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.graphics.drawable.Icon
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.content.ContextCompat
import java.util.concurrent.atomic.AtomicInteger

/**
 * 解析・チャットの実行中だけ前面サービスを立てる。
 *
 * これが無いと、アプリをバックグラウンドに送った直後に
 * プロセスが cached → frozen 扱いになり、通信中のソケットが
 * "Software caused connection abort" で切られる（Android 12+ の App Freezer）。
 * 前面サービスを持つプロセスは凍結対象から外れるので、
 * 別アプリを触っていても応答を最後まで受け取れる。
 *
 * 加えて PARTIAL_WAKE_LOCK を持つ。前面サービスは CPU の起動状態までは
 * 保証しないため、これが無いと画面を消したまま一括実行を回したときに
 * 端末がスリープへ入り、途中で止まったように見えることがある。
 */
class RequestService : Service() {

    companion object {
        private const val CHANNEL = "codex_request"
        private const val NOTIF_ID = 4711

        /** 通知の「中止」から送られてくる。 */
        const val ACTION_STOP = "dev.mokouliszt.goldras.action.STOP"

        /** 同時に走るリクエスト数。0→1 で起動、1→0 で停止。 */
        private val active = AtomicInteger(0)

        /** 通知に出す現在の状態。サービス実体より先に決まることがあるので companion に置く。 */
        @Volatile private var label: String = "分析中"
        @Volatile private var done: Int = 0
        @Volatile private var total: Int = 0
        @Volatile private var instance: RequestService? = null

        fun begin(context: Context, what: String = "分析中") {
            label = what
            if (active.incrementAndGet() == 1) {
                val i = Intent(context, RequestService::class.java)
                runCatching { ContextCompat.startForegroundService(context.applicationContext, i) }
            } else {
                instance?.refresh()
            }
        }

        /**
         * 一括実行の進捗を通知に反映する。
         * total が 0 なら件数を出さず、不定の実行中表示にする。
         */
        fun progress(what: String, doneCount: Int = 0, totalCount: Int = 0) {
            label = what
            done = doneCount
            total = totalCount
            instance?.refresh()
        }

        fun end(context: Context) {
            if (active.decrementAndGet() <= 0) {
                active.set(0)
                label = "分析中"; done = 0; total = 0
                runCatching { context.applicationContext.stopService(Intent(context, RequestService::class.java)) }
            }
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private var wakeLock: PowerManager.WakeLock? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            // 通知から中止された。走っているジョブを畳んでから自分を終わらせる。
            MainActivity.cancelAll()
            runCatching { stopForeground(STOP_FOREGROUND_REMOVE) }
            stopSelf()
            return START_NOT_STICKY
        }
        instance = this
        runCatching { startForeground(NOTIF_ID, notification()) }
        acquireWakeLock()
        return START_NOT_STICKY
    }

    /** 進捗が動いたときに通知だけ差し替える。 */
    fun refresh() {
        runCatching {
            getSystemService(NotificationManager::class.java).notify(NOTIF_ID, notification())
        }
    }

    private fun acquireWakeLock() {
        if (wakeLock?.isHeld == true) return
        runCatching {
            val pm = getSystemService(PowerManager::class.java)
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Goldras:request").apply {
                setReferenceCounted(false)
                // 取りこぼしても永久に握り続けないよう、上限を付ける。
                // 一括実行が長引いても2時間で必ず解放される。
                acquire(2 * 60 * 60 * 1000L)
            }
        }
    }

    override fun onDestroy() {
        if (instance === this) instance = null
        runCatching { if (wakeLock?.isHeld == true) wakeLock?.release() }
        wakeLock = null
        super.onDestroy()
    }

    private fun notification(): Notification {
        val nm = getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CHANNEL) == null) {
            nm.createNotificationChannel(
                NotificationChannel(CHANNEL, "実行中の処理", NotificationManager.IMPORTANCE_LOW).apply {
                    description = "市場データの取得やAI分析が終わるまで表示されます"
                    setShowBadge(false)
                }
            )
        }
        val tap = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        val stop = PendingIntent.getService(
            this, 1,
            Intent(this, RequestService::class.java).setAction(ACTION_STOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        val builder = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(this, CHANNEL)
        else @Suppress("DEPRECATION") Notification.Builder(this)

        val hasCount = total > 0
        builder
            .setContentTitle(if (hasCount) "AI分析 $done/$total 件" else label)
            .setContentText(if (hasCount) label else "終わるまで接続を保っています")
            .setSmallIcon(android.R.drawable.stat_sys_download)
            .setContentIntent(tap)
            .setOngoing(true)
            .setOnlyAlertOnce(true)  // 進捗のたびに音や振動を出さない

        // 件数が決まっているときだけ実測の進捗バー、それ以外は不定表示
        if (hasCount) builder.setProgress(total, done, false)
        else builder.setProgress(0, 0, true)

        runCatching {
            builder.addAction(
                Notification.Action.Builder(
                    Icon.createWithResource(this, android.R.drawable.ic_menu_close_clear_cancel),
                    "中止", stop,
                ).build()
            )
        }
        return builder.build()
    }
}
