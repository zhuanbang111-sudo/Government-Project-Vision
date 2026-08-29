import { Suspense } from "react"; import { AuthForm } from "../auth-form";
export default function AccountPage() { return <div className="mx-auto max-w-5xl"><Suspense><AuthForm mode="account" /></Suspense></div>; }
