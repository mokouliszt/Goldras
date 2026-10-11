import {
  Download,
  Github,
  Layers,
  Gauge,
  BellRing,
  Sparkles,
  ShieldCheck,
  ScrollText,
  ArrowRight,
  Server,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { APK, REPO, RELEASES, CostBar, Phone, Section, asset } from "@/components/common";

export default function App() {
  return (
    <div className="min-h-screen">
      <Header />
      <main>
        <Hero />
        <Thesis />
        <Categories />
        <Features />
        <Honesty />
        <Install />
        <Notes />
      </main>
      <Footer />
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-line bg-pit/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-content items-center justify-between px-5">
        <a href="#top" className="flex min-h-[44px] items-center gap-2.5">
          <img src={asset("icon.png")} alt="" width={30} height={30} className="rounded-[8px]" />
          <span className="font-disp text-[19px] font-bold tracking-tight">Goldras</span>
        </a>
        <nav className="flex items-center gap-1 md:gap-2">
          <a href="#thesis" className="hidden px-3 py-2 text-[14px] text-ink/60 hover:text-ink sm:block">
            考え方
          </a>
          <a href="#features" className="hidden px-3 py-2 text-[14px] text-ink/60 hover:text-ink sm:block">
            機能
          </a>
          <a href="#install" className="hidden px-3 py-2 text-[14px] text-ink/60 hover:text-ink sm:block">
            導入
          </a>
          <Button href={REPO} size="sm" variant="outline" target="_blank" rel="noreferrer">
            <Github size={16} />
            GitHub
          </Button>
        </nav>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ */

function Hero() {
  return (
    <section id="top" className="seam-glow relative overflow-hidden px-5 pb-12 pt-12 md:pb-24 md:pt-20">
      <div className="mx-auto grid max-w-content items-center gap-10 md:grid-cols-[1.05fr_.95fr] md:gap-8">
        <div>
          <Badge className="mb-6">
            <Sparkles size={13} />
            自分のChatGPT枠で動く
          </Badge>

          <h1 className="font-disp text-[38px] font-bold leading-[1.22] tracking-tight md:text-[58px]">
            金鉱株を、
            <br />
            <span className="text-bullion">コスト</span>から見る。
          </h1>

          <p className="mt-6 max-w-xl text-[15.5px] leading-[2] text-ink/60 md:text-[16.5px]">
            金がいくら上がっても、掘るのに同じだけかかるなら利益は増えません。
            Goldras は採掘コストと金価格の差を1本の帯にして、
            1年持つに値する状態かを確かめるための Android アプリです。
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Button href={APK} size="lg" target="_blank" rel="noreferrer">
              <Download size={18} />
              APKをダウンロード
            </Button>
            <Button href={REPO} size="lg" variant="outline" target="_blank" rel="noreferrer">
              <Github size={18} />
              ソースを見る
            </Button>
          </div>

          <p className="mt-5 text-[12.5px] leading-relaxed text-ink/40">
            Android 8.0 以上（arm64）/ MIT ライセンス
            <br />
            市場データの表示だけならログイン不要で動きます
          </p>
        </div>

        <div className="flex justify-center md:justify-end">
          <Phone src="screens/today.png" alt="Goldras の今日タブ" priority />
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */

/** このアプリが何を見ているかを、図そのもので説明する */
function Thesis() {
  return (
    <Section
      id="thesis"
      eyebrow="The bar"
      title="この1本が、すべての起点"
      lead="帯の全長が金1オンスの売値です。左から採掘コストが埋めていき、残った部分がそのまま利ざやになります。金が上がってもコストが同じだけ上がれば、帯の見え方は変わりません。"
      className="strata border-y border-line bg-seam/40"
    >
      <div className="grid items-stretch gap-5 md:grid-cols-3">
        <BarCase
          label="余裕がある"
          note="金 $4,400 / コスト $1,310"
          cost={30}
          value="マージン 70%"
          tone="text-bullion"
        />
        <BarCase
          label="圧迫されている"
          note="金 $4,400 / コスト $3,600"
          cost={82}
          value="マージン 18%"
          tone="text-slag"
          thin
        />
        <div className="flex flex-col rounded-2xl border border-line bg-seam p-6">
          <div className="eyebrow mb-3 text-copper">Royalty</div>
          <CardTitle>そもそも掘らない会社もある</CardTitle>
          <CardBody>
            ロイヤリティ企業は鉱山を持たず、契約した価格で受け取るだけ。採掘コストの上昇に晒されません。
            同じ図が成立しないので、別の描き方にしています。
          </CardBody>
          <div className="mt-auto pt-5">
            <div className="costbar">
              <i style={{ width: "100%", background: "var(--bullion)" }} />
              <i style={{ width: "14%", background: "var(--copper)" }} />
            </div>
            <p className="mt-2 text-[12px] text-copper">固定の取得価格</p>
          </div>
        </div>
      </div>
    </Section>
  );
}

function BarCase({
  label,
  note,
  cost,
  value,
  tone,
  thin,
}: {
  label: string;
  note: string;
  cost: number;
  value: string;
  tone: string;
  thin?: boolean;
}) {
  return (
    <div className="flex flex-col rounded-2xl border border-line bg-seam p-6">
      <div className="eyebrow mb-3 text-ore">Miner</div>
      <CardTitle>{label}</CardTitle>
      <CardBody>{note}</CardBody>
      <div className="mt-auto pt-5">
        <CostBar cost={cost} thin={thin} />
        <div className="mt-2 flex justify-between text-[12px]">
          <span className="text-ore">採掘コスト</span>
          <span className={`fig ${tone}`}>{value}</span>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Categories() {
  return (
    <Section
      eyebrow="Not all the same"
      title={
        <>
          同じ「金鉱株」として
          <br className="hidden sm:block" />
          扱わない
        </>
      }
      lead="業態が違うものを同じ物差しで測っても意味がありません。3つに分けて、評価式そのものを切り替えています。"
    >
      <div className="grid gap-5 md:grid-cols-3">
        <Cat
          accent="var(--copper)"
          name="ロイヤリティ"
          who="WPM / FNV"
          text="鉱山を持たず権利収入を得る。採掘コストと燃料費の影響を受けない。FNV は石油ガスの権益も持つため、原油高を鉱山会社とは逆符号で扱う。"
        />
        <Cat
          accent="var(--bullion)"
          name="大手"
          who="NEM / B / AEM"
          text="資産が分散し、個別鉱山のトラブル耐性が高い。マクロ寄りの評価が効く。"
        />
        <Cat
          accent="#6e7a87"
          name="中堅"
          who="KGC / AU / EGO / AGI"
          text="鉱山数が少なく、1鉱山の事故や政変が業績に直結する。操業ニュースの比重が大きい。"
        />
      </div>
      <p className="mt-8 text-[13.5px] leading-[1.9] text-ink/40">
        AI への指示文にも「ロイヤリティ会社に採掘コストの話を当てはめるな」と明示しています。
        銘柄はアプリ内から追加・削除できます。
      </p>
    </Section>
  );
}

function Cat({ accent, name, who, text }: { accent: string; name: string; who: string; text: string }) {
  return (
    <div className="rounded-2xl border border-line bg-seam p-6">
      <div className="flex items-center gap-2.5">
        <span className="h-5 w-[3px] rounded-full" style={{ background: accent }} />
        <CardTitle>{name}</CardTitle>
      </div>
      <p className="fig mt-2 text-[12.5px] text-ore">{who}</p>
      <CardBody>{text}</CardBody>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Features() {
  return (
    <Section
      id="features"
      eyebrow="Features"
      title="判断材料を、1画面に"
      className="strata border-y border-line bg-seam/40"
    >
      <div className="grid items-start gap-14 md:grid-cols-[1fr_290px] md:gap-10">
        <div className="grid gap-5 sm:grid-cols-2">
          <Feature
            icon={<Gauge size={19} />}
            title="買い場スコア"
            text="割安度30% / マージン25% / マクロ25% / 需給20%。1年保有を前提に、割安度とマージンで過半を占める配分にしています。"
          />
          <Feature
            icon={<ShieldCheck size={19} />}
            title="危険信号でスコアに上限"
            text="コストガイダンスの上方修正、鉱山の停止、産出国の税制変更などを検出している間は、どれだけ安く見えても上限がかかります。"
          />
          <Feature
            icon={<Layers size={19} />}
            title="金そのものの需給"
            text="実質金利、中央銀行の購入、ETF残高、ドル指数、COMEXの投機筋ポジション。1年保有ではここが最も効きます。"
          />
          <Feature
            icon={<BellRing size={19} />}
            title="重要イベントだけ通知"
            text="日々の値動きは通知しません。まず価格で機械的に検出し、何か掴んだ日だけ AI が裏を取ります。"
          />
          <Feature
            icon={<Sparkles size={19} />}
            title="AIをまとめて実行"
            text="銘柄を1つずつ開いて回る必要はありません。実行前に処理件数を提示し、画面を消していても最後まで走ります。"
          />
          <Feature
            icon={<Server size={19} />}
            title="サーバーもAPIキーも不要"
            text="価格や金利は端末が直接取得。採掘コストや現地の動向は、あなた自身の ChatGPT 枠で調べます。"
          />
        </div>

        <div className="justify-self-center md:justify-self-end">
          <Phone src="screens/signal.png" alt="買い場スコアの一覧" />
        </div>
      </div>

      <div className="mt-16 grid gap-6 sm:grid-cols-3">
        <Shot src="screens/gold.png" alt="金の需給" caption="金の需給とマクロ指標" />
        <Shot src="screens/miners.png" alt="銘柄一覧" caption="業態で分かれた銘柄一覧" />
        <Shot src="screens/ai-chat.png" alt="AI相談" caption="手元のデータを渡して相談" />
      </div>
    </Section>
  );
}

function Feature({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <Card>
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-bullion-soft text-bullion">
        {icon}
      </div>
      <CardTitle>{title}</CardTitle>
      <CardBody>{text}</CardBody>
    </Card>
  );
}

function Shot({ src, alt, caption }: { src: string; alt: string; caption: string }) {
  return (
    <figure className="m-0">
      <div className="overflow-hidden rounded-2xl border border-line bg-seam">
        <img src={asset(src)} alt={alt} loading="lazy" decoding="async" className="w-full" />
      </div>
      <figcaption className="mt-3 text-center text-[12.5px] text-ink/40">{caption}</figcaption>
    </figure>
  );
}

/* ------------------------------------------------------------------ */

/** このアプリの姿勢そのもの。ここを隠すと、ただの当たる風アプリになる */
function Honesty() {
  return (
    <Section eyebrow="Self-check" title="当たらないことを、直視する">
      <div className="grid items-center gap-12 md:grid-cols-[1fr_290px] md:gap-10">
        <div>
          <div className="rounded-2xl border border-bullion/25 bg-seam p-7">
            <ScrollText size={20} className="mb-4 text-bullion" />
            <p className="text-[16px] leading-[2] md:text-[17px]">
              3ヶ月の株価予測はほぼ雑音です。的中率が5割前後に落ち着くなら、それが正常な結果です。
              <span className="text-bullion">この数字は予測を疑うために置いています。</span>
            </p>
            <p className="mt-4 text-[12.5px] text-ink/40">— アプリ内「予測ログ」の説明文より</p>
          </div>

          <p className="mt-8 text-[15px] leading-[2] text-ink/60">
            生成した予測は日付付きで保存され、期限が来ると現在値と突き合わせて自動採点されます。
            方向は合っていたか、想定レンジに収まったか。
            この仕組みがないと、それらしい予測を検証せずに信じ続けることになります。
          </p>
          <p className="mt-4 text-[15px] leading-[2] text-ink/60">
            Goldras は当てるための道具ではありません。
            見落としを減らし、根拠が崩れたことに気づくための道具です。
          </p>
        </div>

        <div className="justify-self-center md:justify-self-end">
          <Phone src="screens/ai-log.png" alt="予測ログ" />
        </div>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ */

function Install() {
  return (
    <Section
      id="install"
      eyebrow="Install"
      title="はじめかた"
      className="strata border-y border-line bg-seam/40"
    >
      <div className="grid gap-10 md:grid-cols-[1.1fr_.9fr]">
        <ol className="m-0 list-none space-y-5 p-0">
          <Step n={1} title="APK を入れる">
            Releases から APK をダウンロードします。事前に「提供元不明のアプリ」のインストールを許可してください。
          </Step>
          <Step n={2} title="そのまま起動する">
            株価・金・原油・実質金利は、ログインなしで取得・表示できます。まずここまでで手触りを確かめられます。
          </Step>
          <Step n={3} title="ChatGPT にログインする">
            採掘コスト、ガイダンス改定、鉱山の操業状況を取り込みます。あなた自身のサブスクリプション枠で動きます。
            API キーは使いません。
          </Step>
          <Step n={4} title="まとめて更新する">
            ヘッダーの ✨ から一括実行。9銘柄と金の需給で10件、10〜20分ほど。
            実行中も別のアプリを触れます。
          </Step>
        </ol>

        <div>
          <Card>
            <CardTitle>必要なもの</CardTitle>
            <ul className="m-0 mt-4 list-none space-y-3 p-0 text-[14px] text-ink/60">
              <li className="flex justify-between gap-4 border-b border-line pb-3">
                <span>Android</span>
                <span className="fig text-ink">8.0 以上・arm64</span>
              </li>
              <li className="flex justify-between gap-4 border-b border-line pb-3">
                <span>ChatGPT</span>
                <span className="fig text-ink">有効な契約</span>
              </li>
              <li className="flex justify-between gap-4 border-b border-line pb-3">
                <span>APIキー</span>
                <span className="fig text-ink">不要</span>
              </li>
              <li className="flex justify-between gap-4">
                <span>サーバー</span>
                <span className="fig text-ink">不要</span>
              </li>
            </ul>

            <div className="mt-6 flex flex-col gap-3">
              <Button href={APK} target="_blank" rel="noreferrer">
                <Download size={17} />
                最新版を入手
              </Button>
              <Button href={RELEASES} variant="outline" target="_blank" rel="noreferrer">
                過去のリリース
                <ArrowRight size={15} />
              </Button>
            </div>
          </Card>

          <p className="mt-5 text-[12.5px] leading-[1.9] text-ink/40">
            ソースからビルドする場合、先に <code className="fig text-ink/60">webui</code> をビルドしてから
            <code className="fig text-ink/60"> ./gradlew assembleRelease</code> を実行してください。
            手順は README にあります。
          </p>
        </div>
      </div>
    </Section>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-5">
      <span className="fig mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-bullion/40 text-[14px] text-bullion">
        {n}
      </span>
      <div>
        <h3 className="m-0 text-[16px] font-bold tracking-tight">{title}</h3>
        <p className="mt-1.5 text-[14.5px] leading-[1.9] text-ink/60">{children}</p>
      </div>
    </li>
  );
}

/* ------------------------------------------------------------------ */

function Notes() {
  return (
    <Section eyebrow="Notes" title="ご利用にあたって">
      <div className="grid gap-5 md:grid-cols-2">
        <Card>
          <CardTitle>これは投資助言ではありません</CardTitle>
          <CardBody>
            スコアも予測も、過去のデータと公開情報から機械的に導いた参考値にすぎません。
            AI が取得した数値には誤りが含まれることがあります。
            重要な判断の前には、必ず各社の IR 資料など一次情報を確認してください。
          </CardBody>
        </Card>
        <Card>
          <CardTitle>データは端末の中だけ</CardTitle>
          <CardBody>
            銘柄・市場データ・予測ログ・設定は端末内にのみ保存され、外部への同期は行いません。
            端末外に出るのは、調査リクエストに含まれる銘柄名と手元の数値だけです。
          </CardBody>
        </Card>
        <Card>
          <CardTitle>外部サービスの変更に左右されます</CardTitle>
          <CardBody>
            価格は Yahoo Finance の非公式エンドポイントから取得しています。ChatGPT との通信は同梱の公式 Codex が行いますが、
            どちらも提供側の変更で動かなくなることがあります。
            利用にあたっては OpenAI の利用規約を各自でご確認ください。
          </CardBody>
        </Card>
        <Card>
          <CardTitle>省電力設定に注意</CardTitle>
          <CardBody>
            メーカー独自の省電力機能が、実行中の処理ごと停止させることがあります。
            長時間の一括実行が途中で止まる場合は、電池の設定を「制限なし」にしてください。
          </CardBody>
        </Card>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ */

function Footer() {
  return (
    <footer className="border-t border-line px-5 py-12">
      <div className="mx-auto flex max-w-content flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2.5">
          <img src={asset("icon.png")} alt="" width={26} height={26} className="rounded-[7px]" />
          <span className="font-disp text-[16px] font-bold">Goldras</span>
          <span className="text-[13px] text-ink/40">MIT License</span>
        </div>
        <div className="flex items-center gap-5 text-[13.5px] text-ink/60">
          <a href={REPO} target="_blank" rel="noreferrer" className="hover:text-ink">
            GitHub
          </a>
          <a href={RELEASES} target="_blank" rel="noreferrer" className="hover:text-ink">
            Releases
          </a>
          <a href={`${REPO}/issues`} target="_blank" rel="noreferrer" className="hover:text-ink">
            Issues
          </a>
        </div>
      </div>
      <p className="mx-auto mt-8 max-w-content text-[12px] leading-[1.9] text-ink/40">
        © 2026 mokouliszt — 本アプリは投資助言ではありません。投資判断はご自身の責任で行ってください。
      </p>
    </footer>
  );
}
