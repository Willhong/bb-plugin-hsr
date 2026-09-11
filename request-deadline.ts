export async function withDeadline<T>(request: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([request, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('조회 응답이 지연되고 있습니다. 새로고침으로 다시 시도해 주세요.')), timeoutMs);
    })]);
  } finally { if (timer) clearTimeout(timer); }
}
