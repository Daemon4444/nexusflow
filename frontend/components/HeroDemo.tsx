/* Scripted request → route → stream → bill loop shown under the hero.
   Pure CSS: every row is the same keyframes with a staggered delay, so the
   feed rolls like a live log. Reduced-motion users get the finished state. */
const rows: { k: string; v: string; tone?: "ok" | "cost" }[] = [
  { k: "POST", v: "/v1/chat/completions" },
  { k: "model", v: "qwen3.8-max" },
  { k: "route", v: "dashscope · 杭州 · 缓存命中 81%" },
  { k: "首字", v: "312 ms", tone: "ok" },
  { k: "tokens", v: "输入 90,499 · 输出 1,204" },
  { k: "扣费", v: "−¥0.477324", tone: "cost" },
];

export default function HeroDemo() {
  return (
    <div className="nf-demo" aria-hidden="true">
      <div className="nf-demo-bar">
        <i /><i /><i />
        <span>nexusflow · live</span>
      </div>
      <div className="nf-demo-body">
        <pre className="nf-demo-code">
          <span className="nf-demo-type">curl nexusflow.hk/v1/chat/completions -H &quot;Authorization: Bearer nf-…&quot;</span>
        </pre>
        <ul className="nf-demo-feed">
          {rows.map((r, i) => (
            <li key={r.k} style={{ animationDelay: `${1.4 + i * 0.7}s` }}>
              <span>{r.k}</span>
              <b className={r.tone ? `is-${r.tone}` : undefined}>{r.v}</b>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
