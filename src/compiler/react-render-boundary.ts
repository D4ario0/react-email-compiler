const reactModuleNodeEnv = process.env.NODE_ENV;

let renderQueue: Promise<void> = Promise.resolve();

function setNodeEnv(value: string | undefined): void {
  if (value === undefined) {
    delete process.env.NODE_ENV;
    return;
  }
  process.env.NODE_ENV = value;
}

async function runWithReactModuleEnvironment<Result>(
  render: () => Promise<Result>,
): Promise<Result> {
  const previousNodeEnv = process.env.NODE_ENV;
  setNodeEnv(reactModuleNodeEnv);
  try {
    return await render();
  } finally {
    setNodeEnv(previousNodeEnv);
  }
}

/**
 * React selects its development or production implementation at module-load time.
 * Bundlers can mutate NODE_ENV later, while React Email lazily loads React DOM during
 * rendering. Serialize this process-global compatibility boundary so concurrent
 * compiler transforms cannot restore NODE_ENV over one another.
 */
export function renderWithReactModuleEnvironment<Result>(
  render: () => Promise<Result>,
): Promise<Result> {
  const result = renderQueue.then(() => runWithReactModuleEnvironment(render));
  renderQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}
