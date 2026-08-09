export type EmailProps = Record<string, unknown>;
export type CompilableEmail<Props> = (props: Props) => unknown;

export type CompiledTemplate<Props> = CompilableEmail<Props> & {
  __reactEmailText?: (props: Props) => unknown;
  __reactEmailTextFinalized?: boolean;
};
