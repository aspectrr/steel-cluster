import { TarReader } from "@gera2ld/tarjs";
import { gunzipSync } from "fflate/browser";
import { useCallback } from "react";
import { useQuery, useQueryClient } from "react-query";

export interface RegistryManifest {
  name: string;
  description: string;
  version: string;
  examples: RegistryExample[];
}

export interface RegistryExample {
  slug: string;
  id: string;
  title: string;
  accentColor: string;
  category: string;
  stack: string;
  description: string;
  flags: string[];
  directory: string;
  template: string;
}

export interface TemplateFile {
  code: string;
  filename: string;
  language:
    | "python"
    | "typescript"
    | "javascript"
    | "json"
    | "markdown"
    | "yaml"
    | "html"
    | "css"
    | "shell"
    | "xml"
    | "plaintext";
}

export interface TemplateCode {
  files: TemplateFile[];
}

export interface MappedExample {
  id: string;
  slug: string;
  title: string;
  accentColor: string;
  category: string;
  stack: "python" | "nodejs";
  description: string;
  flags: string[];
  template: string;
  version: string;
  fullExample?: {
    files: TemplateFile[];
  };
}

const REGISTRY_BASE_URL = "https://registry.steel-edge.net";

function mapStackToUIFormat(stack: string): "python" | "nodejs" {
  return stack === "python" ? "python" : "nodejs";
}

function detectLanguage(
  filename: string,
):
  | "python"
  | "typescript"
  | "javascript"
  | "json"
  | "markdown"
  | "yaml"
  | "html"
  | "css"
  | "shell"
  | "xml"
  | "plaintext" {
  const extension = filename.toLowerCase().split(".").pop();

  switch (extension) {
    case "py":
      return "python";
    case "ts":
      return "typescript";
    case "js":
    case "jsx":
      return "javascript";
    case "json":
      return "json";
    case "md":
    case "markdown":
      return "markdown";
    case "yml":
    case "yaml":
      return "yaml";
    case "html":
    case "htm":
      return "html";
    case "css":
      return "css";
    case "sh":
    case "bash":
      return "shell";
    case "xml":
      return "xml";
    case "txt":
      return "plaintext";
    default:
      return "typescript"; // fallback
  }
}

function shouldIncludeFile(filename: string): boolean {
  if (
    filename.includes("PaxHeader/") ||
    filename.includes("/._") ||
    filename.startsWith("./._") ||
    filename.endsWith("/") ||
    filename.startsWith("._")
  ) {
    return false;
  }

  const extensions = [
    ".ts",
    ".js",
    ".py",
    ".json",
    ".md",
    ".txt",
    ".yaml",
    ".yml",
  ];
  return extensions.some((ext) => filename.toLowerCase().endsWith(ext));
}

async function extractTemplateFromUrl(url: string): Promise<{
  files: TemplateFile[];
}> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch template: ${response.status} ${response.statusText}`,
    );
  }

  const compressedData = new Uint8Array(await response.arrayBuffer());

  const decompressedData = await new Promise<Uint8Array>((resolve, reject) => {
    const callback = () => {
      try {
        const result = gunzipSync(compressedData);
        resolve(result);
      } catch (error) {
        reject(error);
      }
    };

    if ("requestIdleCallback" in window) {
      requestIdleCallback(callback, { timeout: 1000 });
    } else {
      setTimeout(callback, 0);
    }
  });

  const reader = await TarReader.load(decompressedData);

  const validFiles = reader.fileInfos.filter((f) => shouldIncludeFile(f.name));

  if (validFiles.length === 0) {
    throw new Error("No valid files found in template");
  }

  const files: TemplateFile[] = validFiles.map((fileInfo) => {
    const filename = fileInfo.name.startsWith("./")
      ? fileInfo.name.slice(2)
      : fileInfo.name;

    return {
      filename,
      code: reader.getTextFile(fileInfo.name),
      language: detectLanguage(filename),
    };
  });

  return {
    files,
  };
}

function mapRegistryExample(
  example: RegistryExample,
  version: string,
): MappedExample {
  const mappedStack = mapStackToUIFormat(example.stack);

  return {
    id: example.id,
    slug: example.slug,
    title: example.title,
    accentColor: example.accentColor,
    category: example.category,
    stack: mappedStack,
    description: example.description,
    flags: example.flags,
    template: example.template,
    version: version,
  };
}

export function useCodeRegistry() {
  const queryClient = useQueryClient();

  const manifestQuery = useQuery<RegistryManifest, Error>({
    queryKey: ["code-registry-manifest"],
    queryFn: async () => {
      const response = await fetch(`${REGISTRY_BASE_URL}/manifest.json`);
      if (!response.ok) {
        throw new Error(
          `Failed to fetch registry manifest: ${response.status}`,
        );
      }
      return response.json();
    },
    staleTime: 5 * 60 * 1000,
    cacheTime: 10 * 60 * 1000,
  });

  const examples =
    manifestQuery.data?.examples.map((example) =>
      mapRegistryExample(example, manifestQuery.data.version),
    ) ?? [];

  const playgroundExamples = examples.filter(
    (example) =>
      example.flags.includes("playground") || example.flags.includes("guide"),
  );

  const extractTemplate = useCallback(
    async (templateUrl: string, templateId: string): Promise<TemplateCode> => {
      const fullUrl = templateUrl.startsWith("http")
        ? templateUrl
        : `${REGISTRY_BASE_URL}/${templateUrl}`;

      return await queryClient.fetchQuery({
        queryKey: ["template", templateId, fullUrl],
        queryFn: async () => {
          const extracted = await extractTemplateFromUrl(fullUrl);

          return {
            files: extracted.files,
          };
        },
        staleTime: 30 * 60 * 1000,
        cacheTime: 60 * 60 * 1000,
        retry: 2,
      });
    },
    [queryClient],
  );

  return {
    examples: playgroundExamples,
    allExamples: examples,
    version: manifestQuery.data?.version,
    isLoading: manifestQuery.isLoading,
    error: manifestQuery.error,
    isError: manifestQuery.isError,
    refetch: manifestQuery.refetch,
    extractTemplate,
  };
}
