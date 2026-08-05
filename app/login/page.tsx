import { cookies } from "next/headers";
import { redirect } from "next/navigation";

// 声明组件参数类型
interface LoginPageProps {
  searchParams: { error?: string };
}

export default function LoginPage({ searchParams }: LoginPageProps) {
  // 直接读取路径中的错误参数，判断是否需要显示错误提示
  const isError = searchParams?.error === "true";

  // 定义服务端表单提交动作 (Server Action)
  async function handleLogin(formData: FormData) {
    "use server";
    const password = formData.get("password") as string;

    // 比对环境变量中的密码
    if (password === process.env.ACCESS_PASSWORD) {
      // 使用 await 异步调用 cookies()，确保符合类型定义
      const cookieStore = await cookies();
      cookieStore.set("site_access", "granted", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 24 * 7, // 7 天有效期
      });
      // 登录成功后跳转回主页
      redirect("/");
    } else {
      // 密码错误，重定向到登录页并带上错误参数
      redirect("/login?error=true");
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full space-y-6 bg-white p-8 rounded-lg shadow border border-gray-200">
        <div className="text-center">
          <h1 className="text-xl font-bold text-gray-900">访问受限</h1>
          <p className="text-sm text-gray-500 mt-2">请输入访问密码以继续使用系统</p>
        </div>

        {/* 密码提交表单 */}
        <form action={handleLogin} className="space-y-4">
          <input
            name="username"
            type="text"
            autoComplete="username"
            value="government-writing-user"
            readOnly
            tabIndex={-1}
            aria-hidden="true"
            className="sr-only"
          />
          <div>
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              placeholder="请输入密码"
              className="w-full p-2.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {isError && (
            <p className="text-xs text-red-600">密码不正确，请重新输入。</p>
          )}

          <button
            type="submit"
            className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-medium transition-colors"
          >
            确认进入
          </button>
        </form>
      </div>
    </main>
  );
}
