import { AlertsSettings } from "@/components/AlertsSettings";

export const metadata = { title: "Email alerts · GoBid" };

export default function AlertsPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-8">
      <h1 className="text-2xl font-bold">Email alerts</h1>
      <p className="mb-6 text-gray-600">Choose the tender categories you want in your daily email.</p>
      <AlertsSettings />
    </main>
  );
}
