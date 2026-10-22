import { LoginForm } from "@/components/LoginForm";

export const metadata = { title: "Sign in · GoBid" };

export default function LoginPage() {
  return (
    <main className="mx-auto w-full max-w-md px-4 py-10">
      <h1 className="text-2xl font-bold">Sign in to GoBid</h1>
      <p className="mt-1 text-gray-600">Get a daily email with new GeM tenders in the categories you choose.</p>
      <div className="mt-6">
        <LoginForm />
      </div>
    </main>
  );
}
