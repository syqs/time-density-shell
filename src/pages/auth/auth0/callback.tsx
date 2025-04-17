// ----------------------------------------------------------------------
import { useCallback, useEffect } from "react";
import { useRouter } from "src/routes/hooks/use-router";

export default function CallbackPage() {
  console.info('CallbackPage');
  const router = useRouter();
  const check = useCallback(() => {
      router.replace('/dashboard');
  }, [router]);

  useEffect(() => {
    check();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  
  return null;
}
