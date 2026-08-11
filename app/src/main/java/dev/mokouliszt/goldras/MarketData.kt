package dev.mokouliszt.goldras

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt

/** 終値の時系列。日付は epoch 秒。 */
data class Series(val symbol: String, val times: LongArray, val closes: DoubleArray) {
    val last: Double get() = closes.lastOrNull() ?: Double.NaN
    fun at(daysAgo: Int): Double {
        val i = closes.size - 1 - daysAgo
        return if (i in closes.indices) closes[i] else Double.NaN
    }
}

/**
 * 無料・APIキー不要の公開エンドポイントのみを使う。
 *   株価/商品/指数 : Yahoo Finance chart API
 *   実質金利       : FRED の CSV エンドポイント（fredgraph.csv）
 *
 * AISC・ガイダンス・中銀買い・建玉といった構造化されていない情報は
 * ここでは扱わず、Codex 側（Prompts.research）に委ねる。
 */
object MarketData {

    private const val UA =
        "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36"

    private val http = Net.client(
        OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(25, TimeUnit.SECONDS)
            .retryOnConnectionFailure(true)
    )

    // ---- 取得 ----

    /** Yahoo から日足終値を取る。失敗時は null。 */
    fun fetchSeries(symbol: String, range: String = "2y"): Series? {
        val url = "https://query1.finance.yahoo.com/v8/finance/chart/" +
            java.net.URLEncoder.encode(symbol, "UTF-8") +
            "?range=$range&interval=1d&includePrePost=false"
        val body = get(url) ?: return null
        return try {
            val result = JSONObject(body).getJSONObject("chart")
                .optJSONArray("result")?.optJSONObject(0) ?: return null
            val ts = result.optJSONArray("timestamp") ?: return null
            val quote = result.getJSONObject("indicators").getJSONArray("quote").getJSONObject(0)
            val adj = result.getJSONObject("indicators")
                .optJSONArray("adjclose")?.optJSONObject(0)?.optJSONArray("adjclose")
            val closeArr = adj ?: quote.getJSONArray("close")
            val times = ArrayList<Long>(ts.length())
            val closes = ArrayList<Double>(ts.length())
            for (i in 0 until ts.length()) {
                val c = closeArr.opt(i)
                if (c == null || c == JSONObject.NULL) continue
                val d = (c as Number).toDouble()
                if (d.isNaN() || d <= 0.0) continue
                times.add(ts.getLong(i)); closes.add(d)
            }
            if (closes.size < 30) null
            else Series(symbol, times.toLongArray(), closes.toDoubleArray())
        } catch (_: Exception) { null }
    }

    /**
     * FRED の系列を CSV で取る（APIキー不要）。DFII10 = 10年物TIPS利回り＝実質金利。
     *
     * 注意: fredgraph.csv はブラウザを騙るような User-Agent を送ると 503 を返す。
     * Yahoo とは逆にヘッダを付けないのが正解なので、意図的に UA を外している。
     */
    fun fetchFred(id: String): Series? {
        val body = get("https://fred.stlouisfed.org/graph/fredgraph.csv?id=$id", ua = null) ?: return null
        return try {
            val lines = body.lineSequence().drop(1).toList() // 1行目は observation_date,<系列名>
            val times = ArrayList<Long>(); val vals = ArrayList<Double>()
            for (line in lines) {
                val parts = line.split(",")
                if (parts.size < 2) continue
                val v = parts[1].trim().toDoubleOrNull() ?: continue // "." は欠測
                val d = runCatching {
                    java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.US)
                        .apply { timeZone = java.util.TimeZone.getTimeZone("UTC") }
                        .parse(parts[0].trim())?.time?.div(1000)
                }.getOrNull() ?: continue
                times.add(d); vals.add(v)
            }
            if (vals.size < 30) null else Series(id, times.toLongArray(), vals.toDoubleArray())
        } catch (_: Exception) { null }
    }

    private fun get(url: String, ua: String? = UA): String? = try {
        val b = Request.Builder().url(url)
        if (ua != null) b.header("User-Agent", ua)
        http.newCall(b.build()).execute().use { if (it.isSuccessful) it.body?.string() else null }
    } catch (_: Exception) { null }

    // ---- まとめて取得 ----

    /** 監視銘柄とベンチマークを並列取得し、スナップショット JSON を返す。 */
    suspend fun snapshot(symbols: List<String>, benchmarks: List<Pair<String, String>>): JSONObject =
        withContext(Dispatchers.IO) {
            coroutineScope {
                val stockJobs = symbols.map { s -> s to async { fetchSeries(s) } }
                val benchJobs = benchmarks.map { (sym, key) -> key to async { fetchSeries(sym) } }
                val realJob = async { fetchFred("DFII10") }

                val quotes = JSONObject()
                val series = JSONObject()
                val failed = JSONArray()
                for ((sym, job) in stockJobs) {
                    val s = job.await()
                    if (s == null) { failed.put(sym); continue }
                    // 1銘柄の異常で全体を落とさない
                    runCatching {
                        quotes.put(sym, metrics(s))
                        series.put(sym, compact(s))
                    }.onFailure { failed.put(sym) }
                }
                val bench = JSONObject()
                for ((key, job) in benchJobs) {
                    val s = job.await() ?: continue
                    bench.put(key, metrics(s).put("spark", compact(s)))
                }
                realJob.await()?.let { r ->
                    bench.put("realRate", JSONObject()
                        .putNum("last", r.last)
                        .putNum("chg1m", r.last - r.at(21))
                        .putNum("chg3m", r.last - r.at(63))
                        .putNum("chg12m", r.last - r.at(252))
                        .put("spark", compact(r)))
                }
                // セクター(GDX)比の相対リターンを各銘柄に足し込む。
                // 個別要因かセクター要因かを切り分けるための軸。
                val gdx = bench.optJSONObject("gdx")
                if (gdx != null) for (t in quotes.keys()) {
                    val q = quotes.optJSONObject(t) ?: continue
                    // 片方でも欠測なら差も欠測。round に通すと NaN が 0 になり、
                    // 「セクター並み」という誤った値として扱われてしまう。
                    q.putNum("relGdx3m", q.optDouble("chg3m", Double.NaN) - gdx.optDouble("chg3m", Double.NaN))
                    q.putNum("relGdx12m", q.optDouble("chg12m", Double.NaN) - gdx.optDouble("chg12m", Double.NaN))
                }
                JSONObject()
                    .put("at", System.currentTimeMillis())
                    .put("quotes", quotes)
                    .put("series", series)
                    .put("bench", bench)
                    .put("failed", failed)
            }
        }

    // ---- 指標 ----

    /**
     * org.json は NaN と Infinity を受け付けず、put した時点で例外を投げる
     * （JSONException: Forbidden numeric value: NaN）。
     * 上場から日が浅い銘柄では 12ヶ月リターンや200日線が計算できず NaN になり、
     * 素直に put すると snapshot 全体が失敗して全銘柄の価格が出なくなる。
     * 値が無いことは null として持たせ、欠測として扱う。
     */
    private fun JSONObject.putNum(key: String, v: Double): JSONObject =
        put(key, if (v.isNaN() || v.isInfinite()) JSONObject.NULL else round(v, 4))

    fun metrics(s: Series): JSONObject {
        val c = s.closes
        val last = c.last()
        val window = c.takeLast(252)
        val hi52 = window.maxOrNull() ?: last
        val lo52 = window.minOrNull() ?: last
        return JSONObject()
            .putNum("last", last)
            .putNum("chg1d", pct(last, s.at(1)))
            .putNum("chg1w", pct(last, s.at(5)))
            .putNum("chg1m", pct(last, s.at(21)))
            .putNum("chg3m", pct(last, s.at(63)))
            .putNum("chg6m", pct(last, s.at(126)))
            .putNum("chg12m", pct(last, s.at(252)))
            .putNum("ma50", sma(c, 50))
            .putNum("ma200", sma(c, 200))
            .putNum("distMa200", sma(c, 200).let { if (it.isNaN()) Double.NaN else (last / it - 1) * 100 })
            .putNum("rsi14", rsi(c, 14))
            .putNum("hi52", hi52)
            .putNum("lo52", lo52)
            .putNum("drawdown", (last / hi52 - 1) * 100)
            .putNum("pctRange52", if (hi52 > lo52) (last - lo52) / (hi52 - lo52) * 100 else 50.0)
            .putNum("vol30", annualVol(c, 30))
    }

    /**
     * 表示用の終値列。直近1年分を日足のまま返す（最大252点）。
     *
     * 以前はここで間引いていたが、そうすると画面側で「直近5営業日」のような
     * 期間を正しく切り出せない。1点が何日分かが変わってしまい、
     * 「今週の値動き」と称して数ヶ月分の線を描くことになる。
     * 解像度は落とさず、日数＝点数が一致する状態を保つ。
     */
    private fun compact(s: Series, days: Int = 252): JSONArray {
        val c = s.closes
        val take = min(c.size, days)
        val out = JSONArray()
        for (i in c.size - take until c.size) out.put(round(c[i], 3))
        return out
    }

    fun sma(c: DoubleArray, n: Int): Double =
        if (c.size < n) Double.NaN else c.takeLast(n).average()

    fun rsi(c: DoubleArray, n: Int): Double {
        if (c.size < n + 1) return Double.NaN
        var gain = 0.0; var loss = 0.0
        for (i in c.size - n until c.size) {
            val d = c[i] - c[i - 1]
            if (d >= 0) gain += d else loss -= d
        }
        if (loss == 0.0) return 100.0
        val rs = (gain / n) / (loss / n)
        return 100 - 100 / (1 + rs)
    }

    private fun annualVol(c: DoubleArray, n: Int): Double {
        if (c.size < n + 1) return Double.NaN
        val rets = (c.size - n until c.size).map { kotlin.math.ln(c[it] / c[it - 1]) }
        val m = rets.average()
        val v = rets.sumOf { (it - m) * (it - m) } / max(1, rets.size - 1)
        return sqrt(v) * sqrt(252.0) * 100
    }

    /** a の b に対する相対リターン（%ポイント）。 */
    fun relative(a: Series?, b: Series?, days: Int): Double {
        if (a == null || b == null) return Double.NaN
        val ra = pct(a.last, a.at(days)); val rb = pct(b.last, b.at(days))
        return if (ra.isNaN() || rb.isNaN()) Double.NaN else ra - rb
    }

    fun pct(now: Double, then: Double): Double =
        if (then.isNaN() || then == 0.0 || now.isNaN()) Double.NaN else (now / then - 1) * 100

    fun round(v: Double, digits: Int): Double {
        if (v.isNaN() || v.isInfinite()) return 0.0
        val f = Math.pow(10.0, digits.toDouble())
        return Math.round(v * f) / f
    }

    /** 0..100 に丸めた線形スコア。lo で 0、hi で 100。 */
    fun scale(v: Double, lo: Double, hi: Double): Double {
        if (v.isNaN()) return 50.0
        if (abs(hi - lo) < 1e-9) return 50.0
        return min(100.0, max(0.0, (v - lo) / (hi - lo) * 100))
    }
}
