package dev.mokouliszt.goldras

import org.json.JSONArray
import org.json.JSONObject

/**
 * Codex への指示文。
 *
 * 方針:
 *  - 数値は必ず web 検索で裏を取る。推測で埋めない。取れなければ null を返す。
 *  - ロイヤリティ会社（WPM/FNV）に AISC の概念を当てはめない。
 *  - 出力は指定した JSON のみ。前置きも Markdown の囲みも付けない。
 */
object Prompts {

    private const val COMMON =
        "You are an equity analyst covering precious-metals miners for a Japanese retail investor. " +
        "The investor holds positions for roughly one year and does not day-trade. " +
        "Always use the web_search tool to verify figures against primary sources " +
        "(company IR pages, quarterly MD&A, news wires). Today's data may be newer than your training data, " +
        "so never answer from memory alone for anything time-sensitive. " +
        "If a figure cannot be verified, return null for it rather than estimating. " +
        "Write all Japanese prose fields in Japanese. Be concise and specific; no filler."

    private const val CATEGORY_NOTE =
        "Category rules — these matter:\n" +
        "  * royalty (WPM, FNV): they own no mines. AISC, diesel cost, capex overrun and mine-level " +
        "grade do NOT apply. Report instead: portfolio breadth, key stream/royalty status, " +
        "counterparty operator risk, and revenue mix. FNV additionally holds oil & gas royalties, " +
        "so higher crude is a revenue tailwind, opposite to the miners.\n" +
        "  * senior / mid: report AISC, production guidance, grade trend, capex, jurisdiction events."

    /** 銘柄1件の基礎情報を取りに行く。 */
    fun research(ticker: String, def: JSONObject, quote: JSONObject?, goldPrice: Double): String {
        val cat = def.optString("category", "mid")
        val name = def.optString("nameEn", ticker)
        val juris = def.optJSONArray("jurisdictions")?.join("、")?.replace("\"", "") ?: ""
        val assets = def.optJSONArray("keyAssets")?.join("、")?.replace("\"", "") ?: ""
        val px = quote?.optDouble("last", Double.NaN) ?: Double.NaN

        return """
$COMMON

$CATEGORY_NOTE

Target: $name (NYSE: $ticker), category = $cat
Known jurisdictions: $juris
Known key assets: $assets
Current share price: ${if (px.isNaN()) "unknown" else "USD %.2f".format(px)}
Current gold price: ${if (goldPrice.isNaN()) "unknown" else "USD %.0f/oz".format(goldPrice)}

Research the most recent quarterly report and the last 90 days of news. Return ONLY this JSON:

{
  "ticker": "$ticker",
  "asOf": "YYYY-MM-DD",           // 参照した最新の決算期または報道の日付
  "aisc": number|null,             // 直近四半期の総維持コスト USD/oz。royalty は null
  "aiscPrior": number|null,        // その前の四半期の AISC
  "aiscGuidance": "string|null",   // 通期ガイダンスの範囲を原文の数値で
  "guidanceTrend": "improving"|"stable"|"worsening"|null,
  "production": number|null,       // 直近四半期の金生産量(千オンス)。royalty は GEO
  "productionUnit": "koz"|"GEO"|null,
  "pnav": number|null,             // 直近のP/NAV倍率。取れなければ null
  "pnav5yAvg": number|null,        // 過去5年平均のP/NAV。取れなければ null
  "evEbitda": number|null,
  "fcfYield": number|null,         // %
  "netDebtEbitda": number|null,
  "dividendYield": number|null,    // %
  "hedged": true|false|null,       // 金の先渡し売り契約があるか
  "reserveLifeYears": number|null,
  "costDrivers": ["string"],       // コストを動かしている要因を日本語で3件以内
  "catalysts": [                   // 今後12ヶ月で株価を動かしうる事象
    { "when": "YYYY-QN または YYYY-MM", "what": "日本語", "impact": "up"|"down"|"either" }
  ],
  "warnings": [                    // 危険信号のみ。無ければ空配列
    { "severity": "high"|"medium", "what": "日本語", "why": "日本語で一文" }
  ],
  "thesis": "この会社を1年持つ理由と、崩れる条件を日本語で3文以内",
  "sources": ["URL"]
}

Warnings must be reserved for things that genuinely damage a one-year holding:
AISC guidance raised, production guidance cut, a mine suspended, a permit revoked or
challenged, a royalty/tax hike in a producing country, a major capex overrun,
equity issuance that dilutes holders, or a covenant/liquidity problem.
Do not list generic market risk. An empty warnings array is the correct answer for a clean quarter.
""".trimIndent()
    }

    /** 金そのものの需給。銘柄によらない共通部分。 */
    fun macroResearch(): String = """
$COMMON

Research the current demand and supply picture for gold itself. Cover the last 90 days.
Return ONLY this JSON:

{
  "asOf": "YYYY-MM-DD",
  "centralBank": {
    "recentTonnes": number|null,     // 直近で確認できる四半期または月の中銀純購入(トン)
    "trend": "accelerating"|"steady"|"slowing"|null,
    "note": "日本語で一文。主な買い手の国名を含める"
  },
  "etfFlow": {
    "recentTonnes": number|null,     // 直近月の金ETF純流出入(トン)。流出はマイナス
    "trend": "inflow"|"neutral"|"outflow"|null,
    "note": "日本語で一文"
  },
  "positioning": {
    "netLongPercentile": number|null, // COMEX投機筋の買い越しが過去5年の何%tileか
    "extreme": true|false|null,        // 極端な買い越し(逆張りの売り材料)か
    "note": "日本語で一文"
  },
  "centralBankScore": number,   // 0-100。金にとって強気なほど高い
  "etfFlowScore": number,       // 0-100
  "positioningScore": number,   // 0-100。買い越しが極端なら低くする(逆張り)
  "supply": { "note": "日本語で一文。鉱山供給と再生金の動向" },
  "themes": [ { "title": "日本語", "detail": "日本語で2文以内", "direction": "up"|"down" } ],
  "summary": "今の金の地合いを日本語で3文以内",
  "sources": ["URL"]
}
""".trimIndent()

    /** シナリオ予測。3ヶ月と12ヶ月を分けて出させる。 */
    fun forecast(ticker: String, def: JSONObject, context: String): String {
        val name = def.optString("nameEn", ticker)
        val cat = def.optString("category", "mid")
        return """
$COMMON

$CATEGORY_NOTE

Target: $name (NYSE: $ticker), category = $cat

Here is the data the app already holds. Use it, and search the web for anything missing or stale.

$context

Produce a scenario forecast. The investor's horizon is about one year, so the 12-month view
carries more weight than the 3-month one. Return ONLY this JSON:

{
  "ticker": "$ticker",
  "basePrice": number,        // 予測の起点にした株価(USD)
  "horizons": [
    {
      "label": "3m"|"12m",
      "direction": "up"|"flat"|"down",   // 起点比 ±3% を超えるかどうかで判定
      "low": number, "high": number,     // 中心的な想定レンジ(USD)
      "confidence": number,              // 0-100。根拠が薄ければ低く出すこと
      "scenarios": [
        { "case": "bull"|"base"|"bear", "probability": number, "target": number,
          "trigger": "日本語でその展開になる条件を一文" }
      ]
    }
  ],
  "drivers": [ { "factor": "日本語", "direction": "up"|"down", "weight": "high"|"medium"|"low" } ],
  "watchFor": ["日本語。今後この予測を見直すべき具体的な出来事"],
  "rationale": "日本語で4文以内。マクロとミクロの両方に触れること",
  "sources": ["URL"]
}

The three probabilities within one horizon must sum to 100.
Be honest about uncertainty: a three-month equity forecast is close to noise, so keep
3m confidence low unless there is a dated, scheduled catalyst.
""".trimIndent()
    }

    /** 対話。手元のデータを全部渡した上で自由に聞ける状態にする。 */
    fun chat(context: String): String = """
$COMMON

$CATEGORY_NOTE

You are answering inside a mobile app called Goldras. Answers are read on a phone,
so keep them short: lead with the answer, then at most a few lines of support.
Use Markdown sparingly (short lists are fine, avoid deep nesting and long tables).

The app holds the following data. Prefer it over your memory, and search the web when
the question needs something newer or outside it.

$context

Ground rules for this conversation:
  * 数値を出すときは、手元のデータか web 検索の結果に基づくこと。記憶から書かない。
  * ロイヤリティ会社に採掘コストの話を当てはめない。
  * 断定的な売買推奨はしない。判断材料と、その根拠が崩れる条件を示す。
  * 利用者は金鉱山ビジネスの専門家ではない。専門用語を使うときは短く注釈を付ける。
""".trimIndent()

    /**
     * 監視用。重要な変化があったときだけ通知したいので、
     * 「通知に値するか」まで含めて判定させる。
     */
    fun watch(context: String): String = """
$COMMON

Here is the current state of the portfolio the app watches:

$context

Search for material news in the last 48 hours about these companies and about gold itself.
Decide whether anything warrants interrupting the user with a push notification.
The user holds for about a year, so daily noise is not material. Only these qualify:
a production or cost guidance change, a mine suspension or restart, a permit or tax or
royalty change in a producing country, an M&A announcement, a large equity issuance,
a resource nationalisation event, or a regime shift in gold itself.

Return ONLY this JSON:

{
  "events": [
    { "ticker": "SYMBOL"|"GOLD", "key": "短い一意キー(英数字)", "severity": "high"|"medium",
      "title": "日本語で40字以内", "detail": "日本語で2文以内", "url": "URL|null" }
  ]
}

An empty events array is the expected result on most days. Do not manufacture news.
""".trimIndent()

    /** アプリが保持しているデータを、モデルに渡せる形に畳む。 */
    fun contextBlock(
        universe: JSONObject, snapshot: JSONObject, fundamentals: JSONObject,
        macro: JSONObject, focus: String? = null,
    ): String {
        val sb = StringBuilder()
        val quotes = snapshot.optJSONObject("quotes") ?: JSONObject()
        val bench = snapshot.optJSONObject("bench") ?: JSONObject()

        sb.appendLine("## Market benchmarks (as of ${iso(snapshot.optLong("at"))})")
        for (key in bench.keys()) {
            val o = bench.optJSONObject(key) ?: continue
            sb.appendLine("- $key: last=${num(o, "last")} 1m=${num(o, "chg1m")}% 3m=${num(o, "chg3m")}% 12m=${num(o, "chg12m")}%")
        }

        sb.appendLine()
        sb.appendLine("## Holdings")
        val arr = universe.optJSONArray("tickers") ?: JSONArray()
        for (i in 0 until arr.length()) {
            val d = arr.optJSONObject(i) ?: continue
            val t = d.optString("ticker")
            if (focus != null && t != focus) continue
            val q = quotes.optJSONObject(t)
            val f = fundamentals.optJSONObject(t)
            sb.appendLine("### $t (${d.optString("nameEn")}) — ${d.optString("category")}")
            if (q != null) sb.appendLine(
                "  price=${num(q, "last")} 3m=${num(q, "chg3m")}% 12m=${num(q, "chg12m")}% " +
                "RSI=${num(q, "rsi14")} vs200MA=${num(q, "distMa200")}% DD=${num(q, "drawdown")}%")
            sb.appendLine("  jurisdictions=${d.optJSONArray("jurisdictions")}")
            if (f != null) {
                sb.appendLine("  aisc=${f.opt("aisc")} guidanceTrend=${f.opt("guidanceTrend")} " +
                    "pnav=${f.opt("pnav")} asOf=${f.optString("asOf")}")
                f.optJSONArray("warnings")?.takeIf { it.length() > 0 }
                    ?.let { sb.appendLine("  warnings=$it") }
            } else sb.appendLine("  (基礎情報は未取得)")
        }

        if (macro.length() > 0) {
            sb.appendLine()
            sb.appendLine("## Gold demand/supply (last AI update ${iso(macro.optLong("at"))})")
            sb.appendLine(macro.optString("summary", "").ifBlank { macro.toString().take(1200) })
        }
        return sb.toString().take(14000)
    }

    private fun num(o: JSONObject, k: String): String {
        val v = o.optDouble(k, Double.NaN)
        return if (v.isNaN()) "-" else String.format("%.2f", v)
    }

    private fun iso(ms: Long): String =
        if (ms <= 0) "unknown"
        else java.text.SimpleDateFormat("yyyy-MM-dd HH:mm", java.util.Locale.US).format(java.util.Date(ms))
}
