import { Text } from "react-email";
import { ActionButton } from "./components/ActionButton.email";
import { Layout } from "./components/Layout.email";

export type AccountAccessInput = {
  assetBaseUrl?: string | undefined;
  mode: "link" | "code";
  url: string;
  code: string;
};

export function AccountAccessEmail({
  assetBaseUrl,
  mode,
  url,
  code,
}: AccountAccessInput) {
  return (
    <Layout
      assetBaseUrl={assetBaseUrl}
      preview={mode === "link" ? "Use your secure sign-in link." : "Use your verification code."}
      title="Access your account"
      footer={mode === "code" ? <Text className="text-fixture-muted m-0 mt-3 text-xs">Code: {code}</Text> : null}
    >
      <Text className="m-0 text-md">
        Complete the verification step to continue to Example Application.
      </Text>
      {mode === "link" ? (
        <ActionButton href={url} label="Continue securely" />
      ) : (
        <Text className="m-0 mt-5 text-md font-bold">Verification code: {code}</Text>
      )}
      <Text className="text-fixture-muted m-0 mt-4 text-sm [overflow-wrap:anywhere]">
        Direct link: {url}
      </Text>
    </Layout>
  );
}

AccountAccessEmail.PreviewProps = {
  mode: "link",
  url: "https://example.com/auth?token=preview",
  code: "123456",
} satisfies AccountAccessInput;
