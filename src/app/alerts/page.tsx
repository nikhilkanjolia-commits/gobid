import { AlertsSettings } from "@/components/AlertsSettings";

export const metadata = { title: "Email alerts · GoBid" };

export default function AlertsPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-semibold tracking-tight text-blue-950 sm:text-3xl">Email alerts</h1>
      <p className="mb-6 mt-1 text-slate-600">Choose the tender categories you want in your daily email.</p>
      <AlertsSettings />
    </main>
  );
}
