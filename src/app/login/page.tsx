import { LoginForm } from "@/components/LoginForm";
import { Icon, Wordmark } from "@/components/ui";

export const metadata = { title: "Sign in · GoBid" };

const POINTS = [
  "Daily 8 AM email with new GeM tenders in your categories",
  "Eligibility checks with the tender page and exact quote",
  "Priced BOQ and Go / No-Go before you commit to a bid",
];

export default function LoginPage() {
  return (
    <main className="grid flex-1 lg:grid-cols-2">
      <section className="hidden flex-col justify-center border-r border-slate-200 bg-blue-50/60 px-12 py-16 lg:flex xl:px-20">
        <Wordmark className="text-xl text-blue-950" />
        <h1 className="mt-10 max-w-md text-3xl font-semibold tracking-tight text-blue-950">Tender preparation for electrical and solar contractors</h1>
        <p className="mt-3 max-w-md text-slate-600">Sign in to save your tender categories and get new matching bids by email every morning.</p>
        <ul className="mt-8 space-y-3">
          {POINTS.map((p) => (
            <li key={p} className="flex items-start gap-3 text-sm text-slate-700">
              <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-blue-600 text-white">
                <Icon name="check" className="h-3 w-3" />
              </span>
              {p}
            </li>
          ))}
        </ul>
        <div className="mt-10 max-w-md rounded-xl border border-slate-200 bg-white p-4 shadow-sm" aria-hidden="true">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-slate-700">Eligibility · OEM authorization</span>
            <span className="rounded-md bg-red-50 px-2 py-0.5 font-semibold text-red-800 ring-1 ring-inset ring-red-600/20">✕ Fail</span>
          </div>
          <p className="mt-2 border-l-2 border-blue-200 pl-3 text-xs italic text-slate-600">“Bidders quoting a make must submit the manufacturer&apos;s authorization…” — tender page 24</p>
          <p className="mt-2 text-[11px] text-slate-400">Example of how a check is shown in a report.</p>
        </div>
      </section>

      <section className="flex flex-col items-center justify-center px-4 py-12 sm:px-6">
        <div className="w-full max-w-sm">
          <div className="lg:hidden">
            <Wordmark className="text-lg text-blue-950" />
          </div>
          <h2 className="mt-6 text-2xl font-semibold tracking-tight text-slate-900 lg:mt-0">Sign in to GoBid</h2>
          <p className="mt-1 text-sm text-slate-600">No password needed. We&apos;ll email you a one-time code.</p>
          <div className="mt-6">
            <LoginForm />
          </div>
          <p className="mt-6 text-center text-xs text-slate-500">You can analyse tenders and browse GeM bids without signing in.</p>
        </div>
      </section>
    </main>
  );
}
