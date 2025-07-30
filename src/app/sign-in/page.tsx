import SpotifySignIn from "@/components/SpotifySignIn";

export default function SignInPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Sign in to your account
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Connect your Spotify account to get started
          </p>
        </div>
        <div className="flex justify-center">
          <SpotifySignIn />
        </div>
      </div>
    </div>
  );
}
