export const METADATA_ROOT = ".silvermoon";
export const CONFIG_PATH = `${METADATA_ROOT}/config.yaml`;
export const IDEAS_ROOT = `${METADATA_ROOT}/ideas`;

export function ideaPaths(id) {
  const ideaPath = `${IDEAS_ROOT}/${id}`;
  const outerPath = `${ideaPath}/outer`;
  const innerPath = `${outerPath}/inner`;
  const idealPath = `${innerPath}/ideal`;
  return {
    ideaPath,
    statusPath: `${ideaPath}/status.yaml`,
    outerPath,
    deploymentDocumentPath: `${outerPath}/Deployment.md`,
    innerPath,
    implementationDocumentPath: `${innerPath}/Implementation.md`,
    idealPath,
    ideaDocumentPath: `${idealPath}/Idea.md`,
  };
}
