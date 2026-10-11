package dev.mokouliszt.goldras

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/**
 * filesDir 直下に素の JSON で保存する。
 *   universe.json     銘柄マスタ（assets の初期値をコピーし、以後は上書き可）
 *   snapshot.json     直近の市場データ（価格・指標）
 *   fundamentals.json 銘柄別の基礎情報。AI更新で書き換わる
 *   macro.json        金そのものの需給（中銀買い・ETF・建玉）。AI更新で書き換わる
 *   predictions.json  予測ログ。期限到来で自動採点する
 */
class Store(context: Context) {

    private val appCtx = context.applicationContext
    private val prefs = appCtx.getSharedPreferences("app", Context.MODE_PRIVATE)

    val workspace: File = File(appCtx.filesDir, "workspace").apply { mkdirs() }

    private fun f(name: String) = File(appCtx.filesDir, name)

    @Synchronized
    private fun readObj(name: String): JSONObject =
        f(name).takeIf { it.exists() }
            ?.let { runCatching { JSONObject(it.readText()) }.getOrNull() } ?: JSONObject()

    @Synchronized
    private fun readArr(name: String): JSONArray =
        f(name).takeIf { it.exists() }
            ?.let { runCatching { JSONArray(it.readText()) }.getOrNull() } ?: JSONArray()

    @Synchronized
    private fun write(name: String, text: String) {
        val file = f(name)
        val tmp = f("$name.tmp")
        tmp.writeText(text)
        if (!tmp.renameTo(file)) { file.writeText(text); tmp.delete() }
        if (runCatching { file.readText() }.getOrNull() != text) error("$name を保存できませんでした")
    }

    // ---- 銘柄マスタ ----

    /** 初回は assets の初期値をコピーする。以後はユーザ編集分が優先。 */
    @Synchronized
    fun universe(): JSONObject {
        val cur = readObj("universe.json")
        if (cur.length() > 0) return cur
        val seed = runCatching {
            appCtx.assets.open("universe.json").bufferedReader().use { it.readText() }
        }.getOrDefault("{}")
        write("universe.json", seed)
        return runCatching { JSONObject(seed) }.getOrDefault(JSONObject())
    }

    fun saveUniverse(o: JSONObject) = write("universe.json", o.toString())

    fun tickers(): JSONArray = universe().optJSONArray("tickers") ?: JSONArray()

    fun symbols(): List<String> =
        tickers().let { arr -> (0 until arr.length()).mapNotNull { arr.optJSONObject(it)?.optString("ticker") } }

    fun benchmarks(): List<Pair<String, String>> {
        val arr = universe().optJSONArray("benchmarks") ?: JSONArray()
        return (0 until arr.length()).mapNotNull {
            val o = arr.optJSONObject(it) ?: return@mapNotNull null
            o.optString("symbol") to o.optString("key")
        }
    }

    fun def(ticker: String): JSONObject {
        val arr = tickers()
        for (i in 0 until arr.length()) {
            val o = arr.optJSONObject(i) ?: continue
            if (o.optString("ticker") == ticker) return o
        }
        return JSONObject()
    }

    /** 銘柄を1件追加または更新する。 */
    @Synchronized
    fun upsertTicker(item: JSONObject) {
        val u = universe()
        val arr = u.optJSONArray("tickers") ?: JSONArray()
        val out = JSONArray()
        var replaced = false
        for (i in 0 until arr.length()) {
            val o = arr.optJSONObject(i) ?: continue
            if (o.optString("ticker") == item.optString("ticker")) {
                // 既存の属性を残しつつ、渡された項目だけ差し替える
                item.keys().forEach { k -> o.put(k, item.get(k)) }
                out.put(o); replaced = true
            } else out.put(o)
        }
        if (!replaced) out.put(item)
        u.put("tickers", out)
        saveUniverse(u)
    }

    @Synchronized
    fun removeTicker(ticker: String) {
        val u = universe()
        val arr = u.optJSONArray("tickers") ?: return
        val out = JSONArray()
        for (i in 0 until arr.length()) {
            val o = arr.optJSONObject(i) ?: continue
            if (o.optString("ticker") != ticker) out.put(o)
        }
        u.put("tickers", out)
        saveUniverse(u)
        val fu = fundamentals(); fu.remove(ticker); write("fundamentals.json", fu.toString())
        // 予測ログも道連れにする。銘柄を消したのに予測だけ残ると、
        // 採点もできず消し方も分からない項目が画面に残り続ける。
        val preds = predictions()
        val keep = JSONArray()
        for (i in 0 until preds.length()) {
            val o = preds.optJSONObject(i) ?: continue
            if (o.optString("ticker") != ticker) keep.put(o)
        }
        savePredictions(keep)
    }

    // ---- 市場データ ----

    /**
     * まだ一度も取得していない（snapshot.json が存在しない）ときも、
     * quotes/series/bench の各キーを持つ完全な形で返す。
     * WebUI 側はこれらのキーが常に存在する前提でアクセスするため、
     * ここで欠けた形を返すと初回起動時にクラッシュする。
     */
    fun snapshot(): JSONObject {
        val o = readObj("snapshot.json")
        if (!o.has("quotes")) o.put("quotes", JSONObject())
        if (!o.has("series")) o.put("series", JSONObject())
        if (!o.has("bench")) o.put("bench", JSONObject())
        if (!o.has("at")) o.put("at", 0L)
        return o
    }
    fun saveSnapshot(o: JSONObject) = write("snapshot.json", o.toString())

    // ---- AI 取得の基礎情報 ----

    fun fundamentals(): JSONObject = readObj("fundamentals.json")

    @Synchronized
    fun saveFundamental(ticker: String, data: JSONObject) {
        val all = fundamentals()
        data.put("at", System.currentTimeMillis())
        all.put(ticker, data)
        write("fundamentals.json", all.toString())
    }

    fun macro(): JSONObject = readObj("macro.json")

    fun saveMacro(o: JSONObject) {
        o.put("at", System.currentTimeMillis())
        write("macro.json", o.toString())
    }

    // ---- 予測ログ ----

    fun predictions(): JSONArray = readArr("predictions.json")

    @Synchronized
    fun addPrediction(p: JSONObject): JSONArray {
        val arr = predictions()
        val out = JSONArray().put(p)
        for (i in 0 until arr.length()) out.put(arr.opt(i))
        write("predictions.json", out.toString())
        return out
    }

    @Synchronized
    fun savePredictions(arr: JSONArray): JSONArray { write("predictions.json", arr.toString()); return arr }

    /**
     * 期限が来た予測に現在値を当てて採点する。
     * 的中の定義は「方向が合っていて、実測がレンジ内に収まったか」。
     */
    @Synchronized
    fun gradePredictions(): JSONArray {
        val arr = predictions()
        val snap = snapshot().optJSONObject("quotes") ?: return arr
        val now = System.currentTimeMillis()
        var changed = false
        for (i in 0 until arr.length()) {
            val p = arr.optJSONObject(i) ?: continue
            if (p.has("result")) continue
            val due = p.optLong("dueAt", 0)
            if (due == 0L || now < due) continue
            val q = snap.optJSONObject(p.optString("ticker")) ?: continue
            val actual = q.optDouble("last", Double.NaN)
            if (actual.isNaN()) continue
            val base = p.optDouble("basePrice", Double.NaN)
            val lo = p.optDouble("low", Double.NaN)
            val hi = p.optDouble("high", Double.NaN)
            val dir = p.optString("direction")
            val actualDir = when {
                base.isNaN() -> "unknown"
                actual > base * 1.03 -> "up"
                actual < base * 0.97 -> "down"
                else -> "flat"
            }
            val inRange = !lo.isNaN() && !hi.isNaN() && actual in lo..hi
            p.put("result", JSONObject()
                .put("actual", MarketData.round(actual, 2))
                .put("actualDirection", actualDir)
                .put("directionHit", dir == actualDir)
                .put("inRange", inRange)
                .put("gradedAt", now))
            changed = true
        }
        if (changed) write("predictions.json", arr.toString())
        return arr
    }

    // ---- 通知済みイベントの重複排除 ----

    fun wasNotified(key: String): Boolean = prefs.getLong("notif_$key", 0) > 0

    /**
     * 通知済みの印は日付入りのキーで増え続けるため、放っておくと
     * SharedPreferences に数千件たまり、起動のたびに全件読み込まれる。
     * 印は重複通知を防げれば十分なので、古いものは捨てる。
     */
    fun markNotified(key: String) {
        val now = System.currentTimeMillis()
        val e = prefs.edit().putLong("notif_$key", now)
        val cutoff = now - 30L * 24 * 3600 * 1000
        prefs.all.forEach { (k, v) ->
            if (k.startsWith("notif_") && v is Long && v < cutoff) e.remove(k)
        }
        e.apply()
    }

    // ---- 設定 ----

    init { migrateSettings() }

    /**
     * v1.4 までは固定のモデル一覧から選ぶしかなく、「Codex のデフォルト」を選べなかった。
     * そのとき保存された値は意図して固定したものとは限らないので、一度だけ消して
     * Codex のデフォルトに追従させる。
     */
    private fun migrateSettings() {
        if (prefs.getInt("settingsVersion", 1) >= 2) return
        prefs.edit().remove("model").remove("effort").putInt("settingsVersion", 2).apply()
    }

    fun settings(): JSONObject = JSONObject().apply {
        // 空 = Codex のデフォルト（モデル）／そのモデルのデフォルト（推論の深さ）
        put("model", prefs.getString("model", "") ?: "")
        put("effort", prefs.getString("effort", "") ?: "")
        // Codex 本体の自動更新: wifi | always | off
        put("codexAutoUpdate", prefs.getString("codexAutoUpdate", "wifi") ?: "wifi")
        put("horizon", prefs.getString("horizon", "12m"))
        put("alerts", prefs.getBoolean("alerts", true))
        put("moveThreshold", prefs.getFloat("moveThreshold", 7f).toDouble())
        put("autoRefresh", prefs.getBoolean("autoRefresh", true))
        // AIを使う自動更新。枠を消費するため既定は off。
        put("autoAnalyze", prefs.getBoolean("autoAnalyze", false))
        put("autoAnalyzeDays", prefs.getInt("autoAnalyzeDays", 7))
    }

    fun saveSettings(o: JSONObject) {
        prefs.edit().apply {
            // model / effort は空文字も有効な値（デフォルトに戻す）なので、キーの有無で判定する
            if (o.has("model")) putString("model", o.optString("model"))
            if (o.has("effort")) putString("effort", o.optString("effort"))
            o.optString("codexAutoUpdate").takeIf { it in setOf("wifi", "always", "off") }
                ?.let { putString("codexAutoUpdate", it) }
            o.optString("horizon").takeIf { it.isNotEmpty() }?.let { putString("horizon", it) }
            if (o.has("alerts")) putBoolean("alerts", o.optBoolean("alerts", true))
            if (o.has("moveThreshold")) putFloat("moveThreshold", o.optDouble("moveThreshold", 7.0).toFloat())
            if (o.has("autoRefresh")) putBoolean("autoRefresh", o.optBoolean("autoRefresh", true))
            if (o.has("autoAnalyze")) putBoolean("autoAnalyze", o.optBoolean("autoAnalyze", false))
            if (o.has("autoAnalyzeDays")) putInt("autoAnalyzeDays", o.optInt("autoAnalyzeDays", 7))
        }.apply()
    }

    /**
     * AI更新が古くなっている対象を返す。
     * 起動のたびに9銘柄を全部調べ直すと ChatGPT の枠を無駄に食うため、
     * 指定日数より古いものだけを対象にする。
     */
    fun staleTargets(days: Int): List<String> {
        val limit = System.currentTimeMillis() - days.toLong() * 24 * 3600 * 1000
        val funds = fundamentals()
        return symbols().filter { (funds.optJSONObject(it)?.optLong("at") ?: 0L) < limit }
    }

    fun macroIsStale(days: Int): Boolean =
        macro().optLong("at", 0L) < System.currentTimeMillis() - days.toLong() * 24 * 3600 * 1000
}
