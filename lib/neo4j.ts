import neo4j, { type Driver, type Session } from "neo4j-driver";

declare global {
  var __lokaiNeo4jDriver: Driver | undefined;
}

function createDriver(): Driver {
  const uri = process.env.NEO4J_URI;
  const username = process.env.NEO4J_USERNAME;
  const password = process.env.NEO4J_PASSWORD;

  if (!uri || !username || !password) {
    throw new Error(
      "Missing Neo4j credentials. Set NEO4J_URI, NEO4J_USERNAME and NEO4J_PASSWORD in .env.local (see files/lokai-setup-guide.md)."
    );
  }

  return neo4j.driver(uri, neo4j.auth.basic(username, password));
}

/** Module-level singleton, reused across warm serverless invocations and Next.js dev HMR. */
export function getDriver(): Driver {
  if (!global.__lokaiNeo4jDriver) {
    global.__lokaiNeo4jDriver = createDriver();
  }
  return global.__lokaiNeo4jDriver;
}

export function getSession(): Session {
  return getDriver().session();
}

export async function runQuery<T = Record<string, unknown>>(
  cypher: string,
  params: Record<string, unknown> = {}
): Promise<T[]> {
  const session = getSession();
  try {
    const result = await session.run(cypher, params);
    return result.records.map((record) => record.toObject() as T);
  } finally {
    await session.close();
  }
}

export async function runWrite<T = Record<string, unknown>>(
  cypher: string,
  params: Record<string, unknown> = {}
): Promise<T[]> {
  const session = getSession();
  try {
    const result = await session.executeWrite((tx) => tx.run(cypher, params));
    return result.records.map((record) => record.toObject() as T);
  } finally {
    await session.close();
  }
}

export async function verifyConnectivity(): Promise<boolean> {
  try {
    await getDriver().verifyConnectivity();
    return true;
  } catch {
    return false;
  }
}
