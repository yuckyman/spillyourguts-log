interface GiteaConfig {
  url: string;
  token: string;
  owner: string;
  repo: string;
}

interface GiteaFileContent {
  content: string;
  encoding: string;
  sha?: string;
}

interface Event {
  id: string;
  type: string;
  amount_oz: number | null;
  created_at: number;
  user_agent: string | null;
  source: string | null;
  note: string | null;
}

export interface Env {
  GITEA_URL?: string;
  GITEA_TOKEN?: string;
  GITEA_OWNER?: string;
  GITEA_REPO?: string;
}

/**
 * Get Gitea config from environment variables
 */
function getGiteaConfig(env: Env): GiteaConfig | null {
  const url = env.GITEA_URL;
  const token = env.GITEA_TOKEN;
  const owner = env.GITEA_OWNER;
  const repo = env.GITEA_REPO;

  if (!url || !token || !owner || !repo) {
    return null;
  }

  return { url, token, owner, repo };
}

/**
 * Get the file path for a monthly JSON file
 */
function getMonthlyFilePath(year: number, month: number): string {
  const monthStr = String(month).padStart(2, '0');
  return `events/${year}-${monthStr}.json`;
}

/**
 * Fetch file content from Gitea
 */
async function getFileContent(
  config: GiteaConfig,
  filepath: string
): Promise<GiteaFileContent | null> {
  const url = `${config.url}/api/v1/repos/${config.owner}/${config.repo}/contents/${filepath}`;
  
  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `token ${config.token}`,
        Accept: 'application/json',
      },
    });

    if (response.status === 404) {
      return null; // File doesn't exist yet
    }

    if (!response.ok) {
      throw new Error(`Gitea API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return {
      content: data.content,
      encoding: data.encoding,
      sha: data.sha,
    };
  } catch (error) {
    console.error('Error fetching file from Gitea:', error);
    throw error;
  }
}

/**
 * Create or update file in Gitea
 */
async function putFileContent(
  config: GiteaConfig,
  filepath: string,
  content: string,
  sha?: string
): Promise<void> {
  const url = `${config.url}/api/v1/repos/${config.owner}/${config.repo}/contents/${filepath}`;
  
  const base64Content = btoa(unescape(encodeURIComponent(content)));
  
  const body: any = {
    message: `Add event: ${new Date().toISOString()}`,
    content: base64Content,
  };

  if (sha) {
    body.sha = sha; // Required for updates
  }

  try {
    const response = await fetch(url, {
      method: sha ? 'PUT' : 'POST',
      headers: {
        Authorization: `token ${config.token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gitea API error: ${response.status} ${response.statusText} - ${errorText}`);
    }
  } catch (error) {
    console.error('Error writing file to Gitea:', error);
    throw error;
  }
}

/**
 * Append event to monthly JSON file in Gitea
 */
export async function appendEventToGitea(event: Event, env: Env): Promise<void> {
  const config = getGiteaConfig(env);
  if (!config) {
    console.warn('Gitea config not available, skipping webhook');
    return;
  }

  try {
    const date = new Date(event.created_at * 1000);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const filepath = getMonthlyFilePath(year, month);

    // Try to get existing file
    const existingFile = await getFileContent(config, filepath);
    
    let events: Event[] = [];
    let sha: string | undefined;

    if (existingFile) {
      // Decode and parse existing content
      if (existingFile.encoding === 'base64') {
        const decoded = atob(existingFile.content);
        events = JSON.parse(decoded);
        sha = existingFile.sha;
      } else {
        // Handle plain text encoding (shouldn't happen but be safe)
        events = JSON.parse(existingFile.content);
        sha = existingFile.sha;
      }
    }

    // Append new event
    events.push(event);

    // Write back to Gitea
    const content = JSON.stringify(events, null, 2);
    await putFileContent(config, filepath, content, sha);

    console.log(`Successfully appended event ${event.id} to ${filepath}`);
  } catch (error) {
    // Log error but don't throw - we don't want to fail the main request
    console.error('Failed to append event to Gitea:', error);
    // Silently fail - data is already in D1, this is just a sync
  }
}

