import { Section, Text } from "react-email";
import { Layout } from "./components/Layout.email";

export type IncidentInput = {
  incidentId: string;
  summary: string;
  attempts: number;
  records: Array<{
    id: string;
    status: string;
  }>;
};

export function IncidentEmail({
  incidentId,
  summary,
  attempts,
  records,
}: IncidentInput) {
  return (
    <Layout
      preview={`Incident ${incidentId} requires attention.`}
      title="Automated operation requires attention"
    >
      <Section className="mb-5">
        <Text className="text-fixture-muted m-0 text-xs font-semibold uppercase">Incident</Text>
        <Text className="m-0 mt-1 text-md">Identifier: {incidentId}</Text>
        <Text className="m-0 text-md">Attempts: {attempts}</Text>
        <Text className="m-0 text-md">Summary: {summary}</Text>
      </Section>
      <Section>
        <Text className="text-fixture-muted m-0 text-xs font-semibold uppercase">Records</Text>
        {records.map((record) => (
          <Text className="m-0 mt-2 text-md" key={record.id}>
            Record {record.id}
            {"\n"}Status {record.status}
          </Text>
        ))}
      </Section>
    </Layout>
  );
}

IncidentEmail.PreviewProps = {
  incidentId: "incident-preview",
  summary: "A background operation did not complete.",
  attempts: 3,
  records: [{ id: "record-preview", status: "pending" }],
} satisfies IncidentInput;
