export function errorMessage(error: unknown, fallback = "服务器内部错误") {
  return error instanceof Error && error.message ? error.message : fallback;
}
