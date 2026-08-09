import { render, toPlainText } from "@react-email/render";
import {
  AccountAccessEmail,
  type AccountAccessInput,
} from "../emails/AccountAccess.email";
import { IncidentEmail, type IncidentInput } from "../emails/Incident.email";

export async function accountAccessTemplate(input: AccountAccessInput) {
  const html = await render(AccountAccessEmail(input));
  return {
    subject: input.mode === "link" ? "Your secure sign-in link" : "Your verification code",
    html,
    text: toPlainText(html),
  };
}

export async function incidentTemplate(input: IncidentInput) {
  const html = await render(IncidentEmail(input));
  return {
    subject: `Incident requires attention: ${input.incidentId}`,
    html,
    text: toPlainText(html),
  };
}
