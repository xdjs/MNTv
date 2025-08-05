import SpotifySignIn from "@/components/SpotifySignIn";
import UserInfo from "@/app/sign-in/_components/UserInfo";


export default function SignInPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8">
        <UserInfo/>
      </div>
    </div>
  );
}
