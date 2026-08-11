package dev.mokouliszt.goldras

import org.json.JSONArray
import org.json.JSONObject
import kotlin.math.max
import kotlin.math.min

/**
 * 買い場スコア。1年程度の保有を前提に、割安度とマージンを重く見る。
 *
 *   割安度 30% … 自身の過去レンジ内の位置、200日線乖離、GDX比の出遅れ
 *   マージン 25% … 金価格に対する採掘コスト(AISC)の余裕と、その方向
 *   マクロ 25% … 実質金利・ドル・金モメンタム・原油(カテゴリ別に符号を反転)
 *   需給 20% … RSI・高値からの下落率・52週レンジ内の位置
 *
 * 数値が欠けている要素は 50（中立）として扱い、その旨を missing に残す。
 * スコアは予測ではなく「今の位置が過去と比べてどこか」を示すもの。
 */
object Scoring {

    private const val W_VALUE = 0.30
    private const val W_MARGIN = 0.25
    private const val W_MACRO = 0.25
    private const val W_FLOW = 0.20

    /**
     * @param q   MarketData.metrics の出力（当該銘柄）
     * @param def universe.json の銘柄定義
     * @param fund AI更新で得た基礎情報（aisc, guidanceTrend, warnings など）。無ければ空
     * @param bench ベンチマーク一式
     */
    fun evaluate(
        q: JSONObject, def: JSONObject, fund: JSONObject?, bench: JSONObject,
        peerMarginPct: Double = Double.NaN,
    ): JSONObject {
        val category = def.optString("category", "mid")
        val missing = JSONArray()

        // ---- 割安度 ----
        // 52週レンジで下にいるほど高得点。200日線からの下方乖離も加点。
        // ただし「下がっているから割安」ではないので、GDX比の相対で補正する。
        val pctRange = q.optDouble("pctRange52", Double.NaN)
        val vRange = 100 - MarketData.scale(pctRange, 0.0, 100.0)
        val vMa = 100 - MarketData.scale(q.optDouble("distMa200", Double.NaN), -25.0, 25.0)
        val relGdx = q.optDouble("relGdx3m", Double.NaN) // セクター比の3ヶ月出遅れ幅
        val vRel = if (relGdx.isNaN()) { missing.put("GDX比"); 50.0 }
                   else 100 - MarketData.scale(relGdx, -20.0, 20.0)
        // AI が P/NAV を取れていれば、それを割安度の主軸に据える
        val pnav = fund?.optDouble("pnav", Double.NaN) ?: Double.NaN
        val pnavHist = fund?.optDouble("pnav5yAvg", Double.NaN) ?: Double.NaN
        val vFund = if (pnav.isNaN() || pnavHist.isNaN() || pnavHist <= 0) { missing.put("P/NAV"); Double.NaN }
                    else 100 - MarketData.scale((pnav / pnavHist - 1) * 100, -40.0, 40.0)
        val value = if (vFund.isNaN()) avg(vRange * 0.45, vMa * 0.25, vRel * 0.30)
                    else avg(vFund * 0.50, vRange * 0.25, vMa * 0.10, vRel * 0.15)

        // ---- マージン ----
        val gold = bench.optJSONObject("gold")?.optDouble("last", Double.NaN) ?: Double.NaN
        val margin: Double
        val marginPct: Double
        if (category == "royalty") {
            // 権利収入は採掘コストに影響されない。金価格の水準そのものがマージン。
            val goldMom = bench.optJSONObject("gold")?.optDouble("chg12m", Double.NaN) ?: Double.NaN
            marginPct = Double.NaN
            margin = if (goldMom.isNaN()) { missing.put("金モメンタム"); 50.0 }
                     else MarketData.scale(goldMom, -15.0, 35.0)
        } else {
            val aisc = fund?.optDouble("aisc", Double.NaN) ?: Double.NaN
            if (aisc.isNaN() || gold.isNaN() || gold <= 0) {
                missing.put("AISC"); marginPct = Double.NaN; margin = 50.0
            } else {
                marginPct = (gold - aisc) / gold * 100
                // 金価格が高い局面では全社のマージンが絶対値で高く出て差が消える。
                // 絶対水準だけで測ると全銘柄が満点になり比較にならないので、
                // 監視銘柄の中央値からの離れ方を同じ重みで併用する。
                val level = MarketData.scale(marginPct, 30.0, 75.0)
                val relative = if (peerMarginPct.isNaN()) { missing.put("同業比"); 50.0 }
                               else MarketData.scale(marginPct - peerMarginPct, -12.0, 12.0)
                // ガイダンス改定の方向。上方修正＝コスト悪化は減点。
                val trend = when (fund?.optString("guidanceTrend", "")) {
                    "improving" -> 78.0
                    "worsening" -> 22.0
                    "stable" -> 55.0
                    else -> { missing.put("ガイダンス方向"); 50.0 }
                }
                margin = level * 0.35 + relative * 0.35 + trend * 0.30
            }
        }

        // ---- マクロ ----
        val real = bench.optJSONObject("realRate")
        val realLevel = real?.optDouble("last", Double.NaN) ?: Double.NaN
        val realChg = real?.optDouble("chg3m", Double.NaN) ?: Double.NaN
        val mReal = if (realLevel.isNaN()) { missing.put("実質金利"); 50.0 }
                    else (100 - MarketData.scale(realLevel, -0.5, 3.0)) * 0.5 +
                         (100 - MarketData.scale(realChg, -0.6, 0.6)) * 0.5
        val dxy = bench.optJSONObject("dxy")?.optDouble("chg3m", Double.NaN) ?: Double.NaN
        val mDxy = 100 - MarketData.scale(dxy, -8.0, 8.0)
        val goldTrend = bench.optJSONObject("gold")?.let {
            val d = it.optDouble("last", Double.NaN); val m = it.optDouble("ma200", Double.NaN)
            if (d.isNaN() || m.isNaN()) Double.NaN else (d / m - 1) * 100
        } ?: Double.NaN
        val mGold = MarketData.scale(goldTrend, -10.0, 20.0)
        val oil = bench.optJSONObject("oil")?.optDouble("chg3m", Double.NaN) ?: Double.NaN
        val oilSens = def.optDouble("oilSensitivity", 0.0)
        val mOil = when {
            oil.isNaN() || oilSens == 0.0 -> 50.0
            oilSens < 0 -> 100 - MarketData.scale(oil, -30.0, 30.0) // 鉱山会社: 原油高はコスト増
            else -> MarketData.scale(oil, -30.0, 30.0)              // FNV: エネルギー権益で原油高は増収
        }
        val macro = mReal * 0.35 + mDxy * 0.20 + mGold * 0.30 + mOil * 0.15

        // ---- 需給・テクニカル ----
        val rsi = q.optDouble("rsi14", Double.NaN)
        val fRsi = 100 - MarketData.scale(rsi, 25.0, 80.0)
        val dd = q.optDouble("drawdown", Double.NaN)
        val fDd = MarketData.scale(-dd, 0.0, 35.0)
        val flow = fRsi * 0.5 + fDd * 0.5

        var score = value * W_VALUE + margin * W_MARGIN + macro * W_MACRO + flow * W_FLOW

        // ---- 警告によるキャップ ----
        // 危険信号があるうちは、どれだけ安く見えても「買い」には振らない。
        val warnings = fund?.optJSONArray("warnings") ?: JSONArray()
        val severe = (0 until warnings.length()).count {
            warnings.optJSONObject(it)?.optString("severity") == "high"
        }
        if (severe > 0) score = min(score, 54.0)
        if (severe > 1) score = min(score, 42.0)

        val verdict = when {
            score >= 70 -> "accumulate"
            score >= 55 -> "starter"
            score >= 40 -> "wait"
            else -> "trim"
        }

        return JSONObject()
            .put("score", MarketData.round(score, 1))
            .put("verdict", verdict)
            .put("parts", JSONObject()
                .put("value", MarketData.round(value, 1))
                .put("margin", MarketData.round(margin, 1))
                .put("macro", MarketData.round(macro, 1))
                .put("flow", MarketData.round(flow, 1)))
            .put("weights", JSONObject()
                .put("value", W_VALUE).put("margin", W_MARGIN)
                .put("macro", W_MACRO).put("flow", W_FLOW))
            .put("marginPct", if (marginPct.isNaN()) JSONObject.NULL else MarketData.round(marginPct, 1))
            .put("missing", missing)
            .put("capped", severe > 0)
    }

    /** 金そのものの環境スコア。銘柄によらない共通の地合い。 */
    fun goldRegime(bench: JSONObject, macroFund: JSONObject?): JSONObject {
        val real = bench.optJSONObject("realRate")
        val realLevel = real?.optDouble("last", Double.NaN) ?: Double.NaN
        val realChg = real?.optDouble("chg3m", Double.NaN) ?: Double.NaN
        val sReal = if (realLevel.isNaN()) 50.0
                    else (100 - MarketData.scale(realLevel, -0.5, 3.0)) * 0.6 +
                         (100 - MarketData.scale(realChg, -0.6, 0.6)) * 0.4
        val sDxy = 100 - MarketData.scale(bench.optJSONObject("dxy")?.optDouble("chg3m", Double.NaN) ?: Double.NaN, -8.0, 8.0)
        val g = bench.optJSONObject("gold")
        val sMom = MarketData.scale(
            g?.let { val d = it.optDouble("last", Double.NaN); val m = it.optDouble("ma200", Double.NaN)
                     if (d.isNaN() || m.isNaN()) Double.NaN else (d / m - 1) * 100 } ?: Double.NaN,
            -10.0, 20.0)
        // 中銀買いと ETF フローは AI 更新から入る。無ければ中立。
        val sCb = macroFund?.optDouble("centralBankScore", Double.NaN)?.takeIf { !it.isNaN() } ?: 50.0
        val sEtf = macroFund?.optDouble("etfFlowScore", Double.NaN)?.takeIf { !it.isNaN() } ?: 50.0
        // 投機筋の買い越しが極端なら逆張りで減点
        val sPos = macroFund?.optDouble("positioningScore", Double.NaN)?.takeIf { !it.isNaN() } ?: 50.0

        val total = sReal * 0.26 + sDxy * 0.12 + sMom * 0.22 + sCb * 0.18 + sEtf * 0.12 + sPos * 0.10
        return JSONObject()
            .put("score", MarketData.round(total, 1))
            .put("parts", JSONObject()
                .put("realRate", MarketData.round(sReal, 0))
                .put("dxy", MarketData.round(sDxy, 0))
                .put("momentum", MarketData.round(sMom, 0))
                .put("centralBank", MarketData.round(sCb, 0))
                .put("etfFlow", MarketData.round(sEtf, 0))
                .put("positioning", MarketData.round(sPos, 0)))
    }

    private fun avg(vararg v: Double) = v.sum()

    fun clamp(v: Double) = max(0.0, min(100.0, v))
}
