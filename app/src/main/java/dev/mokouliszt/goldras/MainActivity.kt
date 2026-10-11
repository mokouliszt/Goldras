package dev.mokouliszt.goldras

import android.annotation.SuppressLint
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Intent
import android.content.pm.ActivityInfo
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.view.HapticFeedbackConstants
import android.view.View
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.browser.customtabs.CustomTabsIntent
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.webkit.WebViewAssetLoader
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.ConcurrentHashMap

class MainActivity : ComponentActivity() {

    private lateinit var web: WebView
    private lateinit var store: Store
    private lateinit var codex: CodexClient

    companion object {
        /** リクエストは Activity より長生きさせる（バックグラウンド化・再生成で切らない） */
        private val appScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
        private val jobs = ConcurrentHashMap<String, Job>()

        @Volatile private var sink: ((String, JSONObject) -> Unit)? = null

        /**
         * 実行中ジョブの直近の進捗。
         * メモリ不足で Activity が破棄されても appScope のジョブは走り続けるため、
         * 戻ってきた画面がここを読んで進捗表示に復帰できるようにしておく。
         */
        @Volatile private var lastProgress: JSONObject? = null

        /** 待っている ChatGPT ログイン（キャンセル用）。 */
        @Volatile private var loginReqId: String? = null
        @Volatile private var codexLoginId: String? = null

        /** Codex の更新確認はアプリの起動ごとに1回（さらに CodexUpdater 側で1時間に1回まで）。 */
        @Volatile private var startupChecked = false
        /** Codex 更新のダウンロード進捗。画面が作り直されても表示に復帰できるように持つ。 */
        @Volatile private var updateProgress: JSONObject? = null

        /** 画面（WebView）が生きているか。バックグラウンドの監視が Codex を止めてよいかの判断に使う。 */
        fun isUiAlive(): Boolean = sink != null

        /** 通知の「中止」から呼ばれる。走っているものを全部畳んで画面にも知らせる。 */
        fun cancelAll() {
            val ids = jobs.keys.toList()
            ids.forEach { jobs.remove(it)?.cancel() }
            lastProgress = null
            sink?.invoke("cancelled", JSONObject().put("count", ids.size))
        }
    }

    private val uiScope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
        WindowCompat.setDecorFitsSystemWindows(window, false)

        store = Store(this)
        codex = CodexClient(this)

        val loader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        web = WebView(this).apply {
            setBackgroundColor(0xFF0B0C0E.toInt())
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.textZoom = 100
            overScrollMode = View.OVER_SCROLL_NEVER
            addJavascriptInterface(Bridge(), "Native")
            webViewClient = object : WebViewClient() {
                override fun shouldInterceptRequest(v: WebView, req: WebResourceRequest): WebResourceResponse? =
                    loader.shouldInterceptRequest(req.url)

                override fun shouldOverrideUrlLoading(v: WebView, req: WebResourceRequest): Boolean {
                    val u = req.url
                    if (u.host == "appassets.androidplatform.net") return false
                    runCatching { startActivity(Intent(Intent.ACTION_VIEW, u)) }
                    return true
                }

                override fun onPageFinished(v: WebView, url: String) = pushInsets()
            }
            loadUrl("https://appassets.androidplatform.net/assets/webui/index.html")
        }
        setContentView(web)

        ViewCompat.setOnApplyWindowInsetsListener(web) { _, insets -> pushInsets(insets); insets }
        sink = { type, payload -> deliver(type, payload) }

        CodexRuntime.isLoggedIn(this) // 保存済みのログイン状態を読み込んでから購読する
        uiScope.launch {
            CodexRuntime.loggedInFlow.collect { emit("auth", JSONObject().put("loggedIn", it)) }
        }

        // Android 13 以降の通知の許可は、targetSdk 28 ではチャンネル作成時にシステムが求める
        Alerts.ensureChannel(this)
        Alerts.schedule(this)
        startupCodexCheck()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        emit("auth", JSONObject().put("loggedIn", CodexRuntime.isLoggedIn(this)))
    }

    override fun onDestroy() {
        if (!isChangingConfigurations) {
            sink = null
            if (jobs.isEmpty() && isFinishing) CodexRuntime.stopIfIdle()
        }
        uiScope.coroutineContext[Job]?.cancel()
        super.onDestroy()
    }

    // ---- insets → CSS 変数 ----

    private fun pushInsets(insets: WindowInsetsCompat? = null) {
        val i = insets ?: ViewCompat.getRootWindowInsets(web) ?: return
        val bars = i.getInsets(WindowInsetsCompat.Type.systemBars())
        val ime = i.getInsets(WindowInsetsCompat.Type.ime())
        val d = resources.displayMetrics.density
        emit("insets", JSONObject()
            .put("top", bars.top / d)
            .put("bottom", bars.bottom / d)
            .put("ime", (if (ime.bottom > 0) ime.bottom - bars.bottom else 0) / d))
    }

    // ---- JS へ ----

    private fun emit(type: String, payload: JSONObject) { (sink ?: return).invoke(type, payload) }

    private fun deliver(type: String, payload: JSONObject) {
        if (isDestroyed || isFinishing) return
        val json = payload.toString().replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")
        runOnUiThread {
            runCatching { web.evaluateJavascript("window.__native&&window.__native(\"$type\",$json)", null) }
        }
    }

    private fun req(id: String) = JSONObject().put("reqId", id)

    private fun launchRequest(reqId: String, what: String = "分析中", block: suspend () -> Unit) {
        val app = applicationContext
        RequestService.begin(app, what)
        jobs[reqId] = appScope.launch {
            try { block() } finally {
                jobs.remove(reqId)
                if (jobs.isEmpty()) lastProgress = null
                RequestService.end(app)
            }
        }
    }

    /** 前面サービスを立てるまでもない短い問い合わせ（モデル一覧など）。 */
    private fun launchQuiet(block: suspend () -> Unit) {
        appScope.launch { runCatching { block() } }
    }

    /** Codex の失敗を画面へ。ログインが切れていれば needLogin を付け、ログイン画面を開かせる。 */
    private fun emitFailure(reqId: String, e: Throwable, fallback: String) {
        if (e is CancellationException) return
        emit("error", req(reqId)
            .put("message", e.message ?: fallback)
            .put("needLogin", (e as? CodexException)?.needLogin == true))
    }

    private fun openExternal(u: Uri) {
        runCatching {
            if (u.scheme == "https" || u.scheme == "http") {
                CustomTabsIntent.Builder().setShowTitle(true).build().launchUrl(this, u)
            } else startActivity(Intent(Intent.ACTION_VIEW, u))
        }
    }

    /** ログインを終えたブラウザから、アプリを前面に戻す。 */
    private fun bringToFront() {
        runCatching {
            applicationContext.startActivity(Intent(applicationContext, MainActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP))
        }
    }

    // ---- 市場データ ----

    private fun runRefresh(reqId: String) {
        launchRequest(reqId, "市場データを取得中") {
            val snap = runCatching { MarketData.snapshot(store.symbols(), store.benchmarks()) }
                .getOrElse {
                    emit("error", req(reqId).put("message", "市場データを取得できませんでした: ${it.message}"))
                    return@launchRequest
                }
            if ((snap.optJSONObject("quotes")?.length() ?: 0) == 0) {
                emit("error", req(reqId).put("message", "市場データが空でした。通信環境を確認してください"))
                return@launchRequest
            }
            withContext(Dispatchers.IO) {
                store.saveSnapshot(snap)
                store.gradePredictions()
            }
            // 一部の銘柄だけ取れなかった場合は黙って捨てず、どれが駄目だったか伝える
            val failed = snap.optJSONArray("failed")
            if (failed != null && failed.length() > 0) {
                val names = (0 until failed.length()).joinToString(", ") { failed.optString(it) }
                emit("error", req(reqId)
                    .put("message", "$names の価格を取得できませんでした。ティッカーを確認してください")
                    .put("soft", true))
            }
            emit("snapshot", req(reqId).put("snapshot", snap).put("scores", computeScores()))
        }
    }

    /** 保有銘柄すべてのスコアと、金そのものの環境スコアをまとめる。 */
    private fun computeScores(): JSONObject {
        val snap = store.snapshot()
        val quotes = snap.optJSONObject("quotes") ?: JSONObject()
        val bench = snap.optJSONObject("bench") ?: JSONObject()
        val funds = store.fundamentals()
        val out = JSONObject()
        val arr = store.tickers()

        // 採掘会社のマージン中央値。個社の水準をこれと比べて相対評価する。
        val gold = bench.optJSONObject("gold")?.optDouble("last", Double.NaN) ?: Double.NaN
        val margins = ArrayList<Double>()
        if (!gold.isNaN() && gold > 0) for (i in 0 until arr.length()) {
            val d = arr.optJSONObject(i) ?: continue
            if (d.optString("category") == "royalty") continue
            val aisc = funds.optJSONObject(d.optString("ticker"))?.optDouble("aisc", Double.NaN) ?: continue
            if (!aisc.isNaN() && aisc > 0) margins.add((gold - aisc) / gold * 100)
        }
        margins.sort()
        val peerMargin = when {
            margins.isEmpty() -> Double.NaN
            margins.size % 2 == 1 -> margins[margins.size / 2]
            else -> (margins[margins.size / 2 - 1] + margins[margins.size / 2]) / 2
        }

        for (i in 0 until arr.length()) {
            val d = arr.optJSONObject(i) ?: continue
            val t = d.optString("ticker")
            val q = quotes.optJSONObject(t) ?: continue
            out.put(t, Scoring.evaluate(q, d, funds.optJSONObject(t), bench, peerMargin))
        }
        return JSONObject()
            .put("tickers", out)
            .put("gold", Scoring.goldRegime(bench, store.macro()))
    }

    // ---- Codex ----

    /** JSON を返させる系のリクエストをまとめて扱う。 */
    /**
     * AIを使う処理は必ずここを通す。未ログインなら実行せずログインを促す。
     * needLogin を付けて返すと、WebUI 側がログイン画面を開く。
     */
    private fun requireLogin(reqId: String): Boolean {
        if (CodexRuntime.isLoggedIn(this)) return true
        emit("error", req(reqId).put("message", "ChatGPTにログインしてください").put("needLogin", true))
        return false
    }

    private fun runJsonTask(
        reqId: String, instructions: String, userText: String,
        jsonTaskLabel: String = "分析中",
        onOk: (JSONObject) -> Unit,
    ) {
        if (!requireLogin(reqId)) return
        val s = store.settings()
        val buf = StringBuilder()
        var finalText: String? = null
        var failed = false
        launchRequest(reqId, jsonTaskLabel) {
            codex.run(instructions, listOf(Msg("user", userText)), s.optString("model"), s.optString("effort"))
                .catch { e ->
                    failed = true
                    emitFailure(reqId, e, "取得に失敗しました")
                }
                .collect { ev ->
                    when (ev) {
                        is CodexEvent.Delta -> buf.append(ev.text)
                        is CodexEvent.Tool -> emit("tool", req(reqId).put("label", ev.label))
                        is CodexEvent.Final -> finalText = ev.text
                    }
                }
            if (failed) return@launchRequest
            val parsed = extractJson(finalText?.takeIf { it.isNotBlank() } ?: buf.toString())
            if (parsed == null) emit("error", req(reqId).put("message", "結果を解釈できませんでした"))
            else runCatching { onOk(parsed) }
                .onFailure { emit("error", req(reqId).put("message", it.message ?: "保存に失敗しました")) }
        }
    }

    private fun runResearch(reqId: String, ticker: String) {
        val def = store.def(ticker)
        if (def.length() == 0) { emit("error", req(reqId).put("message", "銘柄が見つかりません")); return }
        val snap = store.snapshot()
        val quote = snap.optJSONObject("quotes")?.optJSONObject(ticker)
        val gold = snap.optJSONObject("bench")?.optJSONObject("gold")?.optDouble("last", Double.NaN) ?: Double.NaN
        runJsonTask(
            reqId,
            Prompts.research(ticker, def, quote, gold),
            "$ticker の最新の基礎情報を調べて、指定のJSONだけを返してください。",
            "$ticker の基礎情報を調べています",
        ) { data ->
            store.saveFundamental(ticker, data)
            emit("fundamental", req(reqId)
                .put("ticker", ticker).put("data", data).put("scores", computeScores()))
        }
    }

    private fun runMacroResearch(reqId: String) {
        runJsonTask(reqId, Prompts.macroResearch(),
            "金の需給を調べて、指定のJSONだけを返してください。",
            "金の需給を調べています") { data ->
            store.saveMacro(data)
            emit("macro", req(reqId).put("data", data).put("scores", computeScores()))
        }
    }

    private fun runForecast(reqId: String, ticker: String) {
        val def = store.def(ticker)
        if (def.length() == 0) { emit("error", req(reqId).put("message", "銘柄が見つかりません")); return }
        val ctx = Prompts.contextBlock(
            store.universe(), store.snapshot(), store.fundamentals(), store.macro(), focus = ticker)
        val base = store.snapshot().optJSONObject("quotes")?.optJSONObject(ticker)
            ?.optDouble("last", Double.NaN) ?: Double.NaN
        runJsonTask(
            reqId,
            Prompts.forecast(ticker, def, ctx),
            "$ticker のシナリオ予測を作り、指定のJSONだけを返してください。",
            "$ticker の予測を作成中",
        ) { data ->
            savePrediction(ticker, data, base)
            emit("forecast", req(reqId)
                .put("ticker", ticker).put("data", data)
                .put("predictions", store.predictions()))
        }
    }

    /** 予測を期間ごとに1件ずつ、後から採点できる形で保存する。 */
    private fun savePrediction(ticker: String, data: JSONObject, base: Double) {
        val now = System.currentTimeMillis()
        val basePrice = data.optDouble("basePrice", base).takeIf { !it.isNaN() } ?: base
        val horizons = data.optJSONArray("horizons") ?: JSONArray()
        for (i in 0 until horizons.length()) {
            val h = horizons.optJSONObject(i) ?: continue
            val label = h.optString("label", "12m")
            val days = if (label == "3m") 92L else 365L
            store.addPrediction(JSONObject()
                .put("id", "$ticker-$label-$now")
                .put("ticker", ticker)
                .put("horizon", label)
                .put("createdAt", now)
                .put("dueAt", now + days * 24 * 3600 * 1000)
                .put("basePrice", MarketData.round(basePrice, 2))
                .put("direction", h.optString("direction"))
                .put("low", h.optDouble("low", Double.NaN).let { if (it.isNaN()) JSONObject.NULL else it })
                .put("high", h.optDouble("high", Double.NaN).let { if (it.isNaN()) JSONObject.NULL else it })
                .put("confidence", h.optInt("confidence", 0))
                .put("scenarios", h.optJSONArray("scenarios") ?: JSONArray())
                .put("rationale", data.optString("rationale"))
                .put("watchFor", data.optJSONArray("watchFor") ?: JSONArray())
                .put("drivers", data.optJSONArray("drivers") ?: JSONArray())
                .put("sources", data.optJSONArray("sources") ?: JSONArray()))
        }
    }

    private fun runChat(reqId: String, payload: JSONObject) {
        if (!requireLogin(reqId)) return
        val s = store.settings()
        val ctx = Prompts.contextBlock(store.universe(), store.snapshot(), store.fundamentals(), store.macro())
        val arr = payload.optJSONArray("messages") ?: JSONArray()
        val msgs = ArrayList<Msg>()
        for (i in 0 until arr.length()) {
            val m = arr.optJSONObject(i) ?: continue
            msgs.add(Msg(m.optString("role", "user"), m.optString("content")))
        }
        if (msgs.isEmpty()) { emit("done", req(reqId)); return }
        var failed = false
        launchRequest(reqId, "回答を作成中") {
            codex.run(Prompts.chat(ctx), msgs, s.optString("model"), s.optString("effort"))
                .catch { e ->
                    failed = true
                    emitFailure(reqId, e, "通信に失敗しました")
                }
                .collect { ev ->
                    when (ev) {
                        is CodexEvent.Delta -> emit("delta", req(reqId).put("text", ev.text))
                        is CodexEvent.Tool -> emit("tool", req(reqId).put("label", ev.label))
                        is CodexEvent.Final -> {}
                    }
                }
            if (!failed) emit("done", req(reqId))
        }
    }

    /**
     * AIを使う自動更新。
     *
     * 起動のたびに全銘柄を調べ直すと ChatGPT の枠を大きく消費するので、
     * 一定日数より古いものだけを対象にし、直列で回す。
     * モデルと思考の深さは設定画面の値をそのまま使う（runJsonTask 経由）。
     */
    private fun runAutoAnalyze(reqId: String) = runBulk(reqId, JSONObject())

    /**
     * AIを使う処理をまとめて回す。
     *
     * options:
     *   force        true なら鮮度に関わらず全銘柄を対象にする
     *   macro        金の需給を調べる（既定 true）
     *   fundamentals 銘柄の基礎情報を調べる（既定 true）
     *   forecast     シナリオ予測まで作る（既定 false。1銘柄あたりの消費が大きい）
     *
     * どれか1件が失敗しても止めず、残りを続ける。
     * 途中で cancel されたら、そこまでの結果は保存済みのまま終わる。
     */
    private fun runBulk(reqId: String, options: JSONObject) {
        if (!requireLogin(reqId)) return
        val s = store.settings()
        val force = options.optBoolean("force", false)
        val wantMacro = options.optBoolean("macro", true)
        val wantFund = options.optBoolean("fundamentals", true)
        val wantForecast = options.optBoolean("forecast", false)
        val days = s.optInt("autoAnalyzeDays", 7)

        val targets = when {
            !wantFund && !wantForecast -> emptyList()
            force -> store.symbols()
            else -> store.staleTargets(days)
        }
        val needMacro = wantMacro && (force || store.macroIsStale(days))

        if (targets.isEmpty() && !needMacro) {
            emit("autoAnalyze", req(reqId).put("done", true).put("skipped", true))
            return
        }

        val perTicker = (if (wantFund) 1 else 0) + (if (wantForecast) 1 else 0)
        val total = targets.size * perTicker + if (needMacro) 1 else 0
        var doneCount = 0
        var failed = 0

        launchRequest(reqId, "AI分析を実行中") {
            suspend fun step(label: String, instructions: String, userText: String, onOk: (JSONObject) -> Unit) {
                val prog = req(reqId).put("label", label).put("done", doneCount).put("total", total)
                lastProgress = prog
                emit("progress", prog)
                RequestService.progress(label, doneCount, total)
                val buf = StringBuilder()
                var finalText: String? = null
                runCatching {
                    codex.run(instructions, listOf(Msg("user", userText)),
                        s.optString("model"), s.optString("effort"))
                        .catch { }
                        .collect { ev ->
                            when (ev) {
                                is CodexEvent.Delta -> buf.append(ev.text)
                                is CodexEvent.Tool -> emit("tool", req(reqId).put("label", ev.label))
                                is CodexEvent.Final -> finalText = ev.text
                            }
                        }
                }
                val parsed = extractJson(finalText?.takeIf { it.isNotBlank() } ?: buf.toString())
                if (parsed == null) failed++ else runCatching { onOk(parsed) }.onFailure { failed++ }
                doneCount++
            }

            if (needMacro) {
                step("金の需給を調べています", Prompts.macroResearch(),
                    "金の需給を調べて、指定のJSONだけを返してください。") { data ->
                    store.saveMacro(data)
                    emit("macro", req(reqId).put("data", data).put("scores", computeScores()))
                }
            }

            val snap = store.snapshot()
            val gold = snap.optJSONObject("bench")?.optJSONObject("gold")
                ?.optDouble("last", Double.NaN) ?: Double.NaN

            for (t in targets) {
                val def = store.def(t)
                if (def.length() == 0) { doneCount += perTicker; continue }
                val quote = snap.optJSONObject("quotes")?.optJSONObject(t)

                if (wantFund) {
                    step("$t の基礎情報", Prompts.research(t, def, quote, gold),
                        "$t の最新の基礎情報を調べて、指定のJSONだけを返してください。") { data ->
                        store.saveFundamental(t, data)
                        emit("fundamental", req(reqId)
                            .put("ticker", t).put("data", data).put("scores", computeScores()))
                    }
                }

                if (wantForecast) {
                    // 基礎情報を保存した直後の状態で文脈を組み立て直す
                    val ctx = Prompts.contextBlock(
                        store.universe(), store.snapshot(), store.fundamentals(), store.macro(), focus = t)
                    val base = quote?.optDouble("last", Double.NaN) ?: Double.NaN
                    step("$t の予測", Prompts.forecast(t, def, ctx),
                        "$t のシナリオ予測を作り、指定のJSONだけを返してください。") { data ->
                        savePrediction(t, data, base)
                        emit("forecast", req(reqId)
                            .put("ticker", t).put("data", data).put("predictions", store.predictions()))
                    }
                }
            }

            lastProgress = null
            emit("autoAnalyze", req(reqId)
                .put("done", true).put("count", total).put("failed", failed))
        }
    }

    private fun extractJson(text: String): JSONObject? {
        val cleaned = text.replace("```json", "```").let {
            val f = it.indexOf("```")
            if (f >= 0) { val e = it.indexOf("```", f + 3); if (e > f) it.substring(f + 3, e) else it } else it
        }
        val start = cleaned.indexOf('{')
        val end = cleaned.lastIndexOf('}')
        if (start < 0 || end <= start) return null
        return runCatching { JSONObject(cleaned.substring(start, end + 1)) }.getOrNull()
    }

    // ---- Codex: ログイン・モデル・本体の更新 ----

    /**
     * ChatGPT へのログインは Codex に任せる。ブラウザ方式では Codex が端末内の
     * localhost:1455 で認可の戻りを受け取り、コード方式では表示したコードを入力してもらう。
     */
    private fun runLogin(reqId: String, device: Boolean) {
        val app = applicationContext
        loginReqId?.let { jobs.remove(it)?.cancel() }
        loginReqId = reqId
        RequestService.begin(app, "ChatGPTのログインを待っています")
        jobs[reqId] = appScope.launch {
            try {
                val r = CodexRuntime.startLogin(app, device)
                codexLoginId = r.optString("loginId").takeIf { it.isNotBlank() }
                emit("codexLoginStarted", req(reqId)
                    .put("device", device)
                    .put("verificationUrl", r.optString("verificationUrl"))
                    .put("userCode", r.optString("userCode")))
                if (!device) openExternal(Uri.parse(r.optString("authUrl")))
                val done = try { CodexRuntime.awaitLogin() } finally { codexLoginId = null }
                if (!done.optBoolean("success")) {
                    throw CodexException(done.optString("error").takeUnless { it.isBlank() || it == "null" }
                        ?: "ChatGPTへのログインに失敗しました")
                }
                bringToFront()
                emit("auth", req(reqId).put("loggedIn", true))
            } catch (e: CancellationException) {
                throw e
            } catch (e: Throwable) {
                emit("loginFailed", req(reqId).put("message", e.message ?: "ChatGPTへのログインに失敗しました"))
            } finally {
                if (loginReqId == reqId) loginReqId = null
                jobs.remove(reqId)
                RequestService.end(app)
            }
        }
    }

    /** 起動時に openai/codex の新しいリリースを確認する（最大1時間に1回）。 */
    private fun startupCodexCheck() {
        if (startupChecked) return
        startupChecked = true
        val ctx = applicationContext
        appScope.launch {
            if (!CodexUpdater.isSupported(ctx)) return@launch
            // ログイン済みなら、初めての分析を待たせないよう同梱版の展開を先に済ませる
            if (CodexRuntime.isLoggedIn(ctx)) {
                runCatching { CodexRuntime.warmUp(ctx) }.onFailure { Log.w("Goldras", "Codex warm-up failed", it) }
            }
            if (!CodexUpdater.shouldCheck(ctx)) return@launch
            val rel = runCatching { CodexUpdater.latest(ctx) }.getOrNull() ?: return@launch
            if (!CodexUpdater.isNewer(ctx, rel)) {
                emit("codexUpdate", JSONObject().put("status", CodexUpdater.status(ctx)))
                return@launch
            }
            val policy = store.settings().optString("codexAutoUpdate", "wifi")
            val auto = policy == "always" || (policy == "wifi" && !CodexUpdater.isMetered(ctx))
            if (auto) runCodexUpdate("codex-update", rel)
            else emit("codexUpdate", JSONObject().put("status", CodexUpdater.status(ctx)).put("available", rel.version))
        }
    }

    private fun runCodexUpdate(reqId: String, known: CodexUpdater.Release? = null) {
        if (jobs.keys.any { it.startsWith("codex-update") }) return
        val app = applicationContext
        RequestService.begin(app, "Codex を更新しています")
        jobs[reqId] = appScope.launch {
            try {
                val rel = known ?: CodexUpdater.latest(app)
                if (!CodexUpdater.isNewer(app, rel)) {
                    emit("codexUpdate", JSONObject().put("status", CodexUpdater.status(app)).put("upToDate", true))
                    return@launch
                }
                RequestService.progress("Codex ${rel.version} を取得中")
                val v = CodexUpdater.install(app, rel) { have, total ->
                    val p = JSONObject().put("version", rel.version).put("done", have).put("total", total)
                    updateProgress = p
                    emit("codexUpdateProgress", p)
                }
                // 処理中でなければ止めておき、次の要求から新しい版で起動させる
                CodexRuntime.stopIfIdle()
                emit("codexUpdate", JSONObject().put("status", CodexUpdater.status(app)).put("updated", v))
            } catch (e: CancellationException) {
                throw e
            } catch (e: Throwable) {
                emit("codexUpdate", JSONObject().put("status", CodexUpdater.status(app))
                    .put("error", "Codex を更新できませんでした: ${e.message ?: e.javaClass.simpleName}"))
            } finally {
                updateProgress = null
                jobs.remove(reqId)
                RequestService.end(app)
            }
        }
    }

    // ---- JS ブリッジ ----

    inner class Bridge {

        private inline fun guard(what: String, block: () -> String): String =
            try { block() } catch (e: Throwable) {
                Log.e("Goldras", "bridge $what failed", e)
                JSONObject().put("error", e.message ?: e.toString()).toString()
            }

        @JavascriptInterface
        fun state(): String = guard("state") {
            JSONObject()
                .put("loggedIn", CodexRuntime.isLoggedIn(this@MainActivity))
                .put("activeRequest", jobs.keys.firstOrNull { it != loginReqId && !it.startsWith("codex-update") } ?: JSONObject.NULL)
                .put("progress", lastProgress ?: JSONObject.NULL)
                .put("codex", JSONObject()
                    .put("bundled", CodexUpdater.isSupported(this@MainActivity))
                    .put("update", CodexUpdater.status(this@MainActivity))
                    .put("updating", updateProgress ?: JSONObject.NULL))
                .put("settings", store.settings())
                .put("universe", store.universe())
                .put("snapshot", store.snapshot())
                .put("fundamentals", store.fundamentals())
                .put("macro", store.macro())
                .put("predictions", store.gradePredictions())
                .put("scores", computeScores())
                .toString()
        }

        /** device = true でコード方式（別の端末やブラウザでコードを入力する）。 */
        @JavascriptInterface
        fun login(reqId: String, device: Boolean) { runOnUiThread { runLogin(reqId, device) } }

        @JavascriptInterface
        fun cancelLogin() {
            val ctx = applicationContext
            codexLoginId?.let { id -> appScope.launch { CodexRuntime.cancelLogin(ctx, id) } }
            loginReqId?.let { jobs.remove(it)?.cancel() }
            loginReqId = null
        }

        @JavascriptInterface
        fun logout() {
            val ctx = applicationContext
            appScope.launch {
                runCatching { CodexRuntime.logout(ctx) }
                    .onFailure { emit("notice", JSONObject().put("message", "ログアウトできませんでした: ${it.message}")) }
                emit("auth", JSONObject().put("loggedIn", CodexRuntime.isLoggedIn(ctx)))
            }
        }

        /** Codex が提示しているモデルと、ログイン中のアカウント。 */
        @JavascriptInterface
        fun codexModels(reqId: String) {
            val ctx = applicationContext
            launchQuiet {
                try {
                    val account = CodexRuntime.account(ctx)
                    val models = if (account != null) CodexRuntime.models(ctx, fresh = true) else JSONArray()
                    emit("codexModels", req(reqId)
                        .put("models", models)
                        .put("account", account ?: JSONObject.NULL))
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Throwable) {
                    emit("codexModels", req(reqId)
                        .put("models", JSONArray())
                        .put("error", e.message ?: "モデルの一覧を取得できませんでした"))
                }
            }
        }

        @JavascriptInterface
        fun codexCheckUpdate(reqId: String) {
            val ctx = applicationContext
            launchQuiet {
                try {
                    val rel = CodexUpdater.latest(ctx)
                    emit("codexUpdate", req(reqId).put("status", CodexUpdater.status(ctx))
                        .put("available", if (CodexUpdater.isNewer(ctx, rel)) rel.version else "")
                        .put("upToDate", !CodexUpdater.isNewer(ctx, rel)))
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Throwable) {
                    emit("codexUpdate", req(reqId).put("status", CodexUpdater.status(ctx))
                        .put("error", "更新を確認できませんでした: ${e.message ?: e.javaClass.simpleName}"))
                }
            }
        }

        @JavascriptInterface
        fun codexUpdate(reqId: String) { runOnUiThread { runCodexUpdate("codex-update-$reqId") } }

        @JavascriptInterface
        fun refresh(reqId: String) { runOnUiThread { runRefresh(reqId) } }

        @JavascriptInterface
        fun research(reqId: String, ticker: String) { runOnUiThread { runResearch(reqId, ticker) } }

        @JavascriptInterface
        fun researchMacro(reqId: String) { runOnUiThread { runMacroResearch(reqId) } }

        @JavascriptInterface
        fun forecast(reqId: String, ticker: String) { runOnUiThread { runForecast(reqId, ticker) } }

        @JavascriptInterface
        fun chat(reqId: String, payload: String) {
            runOnUiThread { runCatching { runChat(reqId, JSONObject(payload)) } }
        }

        @JavascriptInterface
        fun autoAnalyze(reqId: String) { runOnUiThread { runAutoAnalyze(reqId) } }

        @JavascriptInterface
        fun bulk(reqId: String, options: String) {
            runOnUiThread {
                runBulk(reqId, runCatching { JSONObject(options) }.getOrDefault(JSONObject()))
            }
        }

        /** 一括実行の前に、何件が対象になるかを画面へ返す。 */
        @JavascriptInterface
        fun bulkPlan(): String = guard("bulkPlan") {
            val days = store.settings().optInt("autoAnalyzeDays", 7)
            JSONObject()
                .put("all", JSONArray(store.symbols()))
                .put("stale", JSONArray(store.staleTargets(days)))
                .put("macroStale", store.macroIsStale(days))
                .put("days", days)
                .toString()
        }

        @JavascriptInterface
        fun cancel(reqId: String) { jobs.remove(reqId)?.cancel() }

        @JavascriptInterface
        fun scores(): String = guard("scores") { computeScores().toString() }

        @JavascriptInterface
        fun predictions(): String = guard("predictions") { store.gradePredictions().toString() }

        @JavascriptInterface
        fun deletePrediction(id: String): String = guard("deletePrediction") {
            val arr = store.predictions()
            val out = JSONArray()
            for (i in 0 until arr.length()) {
                val o = arr.optJSONObject(i) ?: continue
                if (o.optString("id") != id) out.put(o)
            }
            store.savePredictions(out).toString()
        }

        @JavascriptInterface
        fun addTicker(json: String): String = guard("addTicker") {
            store.upsertTicker(JSONObject(json)); store.universe().toString()
        }

        @JavascriptInterface
        fun removeTicker(ticker: String): String = guard("removeTicker") {
            store.removeTicker(ticker); store.universe().toString()
        }

        @JavascriptInterface
        fun saveSettings(json: String) {
            runCatching {
                store.saveSettings(JSONObject(json))
                Alerts.schedule(this@MainActivity)
            }.onFailure { Log.e("Goldras", "saveSettings failed", it) }
        }

        @JavascriptInterface
        fun openUrl(url: String) {
            runOnUiThread { runCatching { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) } }
        }

        @JavascriptInterface
        fun copy(text: String) {
            runCatching {
                getSystemService(ClipboardManager::class.java).setPrimaryClip(ClipData.newPlainText("code", text))
            }
        }

        @JavascriptInterface
        fun share(text: String) {
            runOnUiThread {
                val i = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text)
                runCatching { startActivity(Intent.createChooser(i, null)) }
            }
        }

        @JavascriptInterface
        fun haptic() {
            runOnUiThread {
                runCatching {
                    web.performHapticFeedback(
                        if (Build.VERSION.SDK_INT >= 30) HapticFeedbackConstants.CONFIRM
                        else HapticFeedbackConstants.VIRTUAL_KEY)
                }
            }
        }
    }
}
