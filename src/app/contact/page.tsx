import { ContactForm } from "@/components/ContactForm";

export const metadata = { title: "Contact · GoBid" };

export default function ContactPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-semibold tracking-tight text-blue-950 sm:text-3xl">Contact us</h1>
      <p className="mb-6 mt-1 text-slate-600">Questions, feedback, or want to try GoBid with your own tenders? Send us a message and we’ll get back to you by email.</p>
      <ContactForm />
    </main>
  );
}
