import { ForgotPasswordScreen } from "@/components/auth/forgot-password-screen"
import { verificationCodesAvailable } from "@/lib/verification-delivery"

export const dynamic = "force-dynamic"

export default function ForgotPasswordPage() {
  return (
    <main className="min-h-screen bg-background">
      <ForgotPasswordScreen verificationAvailable={verificationCodesAvailable()} />
    </main>
  )
}
