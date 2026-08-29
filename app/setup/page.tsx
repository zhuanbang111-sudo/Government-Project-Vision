import { Suspense } from "react"; import { AuthForm } from "../auth-form";
export default function SetupPage() { return <Suspense><AuthForm mode="setup" /></Suspense>; }
