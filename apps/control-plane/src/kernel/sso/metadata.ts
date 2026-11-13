import { DOMParser } from "@xmldom/xmldom";
import { badRequest } from "../errors.js";

const MAX_BYTES = 2 * 1024 * 1024;
const REDIRECT = "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect";

interface Node {
  nodeType: number;
  localName?: string | null;
  childNodes?: { length: number; [index: number]: Node };
  textContent?: string | null;
  getAttribute?(name: string): string | null;
}

/** An XML document, or an error a person can act on. Never one with a document type. */
export function parseXml(xml: string, what: string): Node {
  // A document type is how XML pulls in entities. Nothing SAML sends has one.
  if (/<!DOCTYPE/i.test(xml) || /<!ENTITY/i.test(xml)) {
    throw badRequest(`${what} has a document type, which is refused.`);
  }
  let failed = false;
  const document = new DOMParser({
    errorHandler: {
      warning: () => {},
      error: () => (failed = true),
      fatalError: () => (failed = true),
    },
  }).parseFromString(xml, "text/xml") as unknown as { documentElement: Node | null };
  if (failed || !document?.documentElement) throw badRequest(`${what} is not well-formed XML.`);
  return document.documentElement;
}

/** Every element under a node, the node included, with the given local name. */
export function elements(root: Node, name: string): Node[] {
  const found: Node[] = [];
  const walk = (node: Node) => {
    if (node.nodeType !== 1) return;
    if (node.localName === name) found.push(node);
    const children = node.childNodes;
    for (let index = 0; index < (children?.length ?? 0); index += 1)
      walk(children?.[index] as Node);
  };
  walk(root);
  return found;
}

/**
 * Reads what an identity provider says about itself: where to send people,
 * what it is called, and the certificates it signs with.
 */
export async function readIdpMetadata(
  source: { xml: string } | { url: string },
): Promise<{ entryPoint: string | undefined; issuer: string | undefined; certificates: string[] }> {
  let xml: string;
  if ("xml" in source) xml = source.xml;
  else {
    const response = await fetch(source.url, {
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
      headers: { accept: "application/samlmetadata+xml, application/xml, text/xml" },
    }).catch(() => undefined);
    if (!response?.ok) {
      throw badRequest(
        `The metadata could not be read from ${source.url}. Check the address, or paste the metadata instead.`,
      );
    }
    xml = await response.text();
  }
  if (Buffer.byteLength(xml) > MAX_BYTES) throw badRequest("The metadata is larger than 2 MB.");
  const root = parseXml(xml, "The metadata");
  const entity = elements(root, "EntityDescriptor")[0];
  const idp = entity ? elements(entity, "IDPSSODescriptor")[0] : undefined;
  if (!entity || !idp) {
    throw badRequest("The metadata does not describe an identity provider.");
  }
  const services = elements(idp, "SingleSignOnService");
  const service =
    services.find((candidate) => candidate.getAttribute?.("Binding") === REDIRECT) ?? services[0];
  const certificates = elements(idp, "KeyDescriptor")
    // A key marked for encryption only is not one the provider signs with.
    .filter((key) => key.getAttribute?.("use") !== "encryption")
    .flatMap((key) => elements(key, "X509Certificate"))
    .map((certificate) => (certificate.textContent ?? "").replace(/\s+/g, ""))
    .filter((certificate, index, all) => certificate !== "" && all.indexOf(certificate) === index);
  return {
    entryPoint: service?.getAttribute?.("Location") ?? undefined,
    issuer: entity.getAttribute?.("entityID") ?? undefined,
    certificates,
  };
}
