import * as vscode from "vscode";

let directoryNamesCache: Record<string, string[]> = {};

export function activate(context: vscode.ExtensionContext) {
  const clearCache = vscode.commands.registerCommand(
    "tabsShifter.clearCache",
    () => {
      directoryNamesCache = {};
      vscode.window.showInformationMessage("Tabs Shifter: Cache Cleared.");
    }
  );
  const shiftToNext = vscode.commands.registerCommand(
    "tabsShifter.shiftToNext",
    cmd(() =>
      process(
        ({ directoryNames, length, index }) =>
          directoryNames[(index + 1) % length]
      )
    )
  );
  const shiftToPrev = vscode.commands.registerCommand(
    "tabsShifter.shiftToPrev",
    cmd(() =>
      process(
        ({ directoryNames, length, index }) =>
          directoryNames[(length + index - 1) % length]
      )
    )
  );
  context.subscriptions.push(clearCache, shiftToNext, shiftToPrev);
}

export function deactivate() {}

interface ChooseConfig {
  directoryNames: string[];
  length: number;
  index: number;
}
async function process(choose: (config: ChooseConfig) => string) {
  const workspaceFolder = getWorkspaceFolder();
  const directoryNames = await getDirectoryNames(workspaceFolder);
  const currentDirectoryName = getCurrentDirectoryName(workspaceFolder);
  const { length } = directoryNames;
  const index = directoryNames.indexOf(currentDirectoryName);
  if (index < 0) throw "Tabs Shifter: Directory not found.";
  const currentDirectoryUri = vscode.Uri.joinPath(
    workspaceFolder.uri,
    currentDirectoryName
  );
  const target = choose({ directoryNames, length, index });
  const everyActiveTabs = vscode.window.tabGroups.all
    .flatMap((tabGroup) => tabGroup.tabs)
    .filter((tab) => tab.input instanceof vscode.TabInputText);
  await Promise.all(
    everyActiveTabs.map(async (activeTab) => {
      const activeTabUri = (activeTab.input as vscode.TabInputText).uri;
      const activeTabUriString = String(activeTabUri);
      const currentDirectoryUriString = String(currentDirectoryUri);
      if (!activeTabUriString.startsWith(currentDirectoryUriString)) return;
      const targetTabUri = vscode.Uri.joinPath(
        workspaceFolder.uri,
        target,
        activeTabUriString.slice(currentDirectoryUriString.length)
      );
      try {
        const stat = await vscode.workspace.fs.stat(targetTabUri);
        if (stat.type !== vscode.FileType.File) return;
      } catch {
        return;
      }
      const { viewColumn } = activeTab.group;
      await vscode.window.showTextDocument(targetTabUri, {
        viewColumn,
        preview: false,
      });
    })
  );
  await vscode.window.tabGroups.close(everyActiveTabs);
}

function getCurrentDirectoryName(workspaceFolder: vscode.WorkspaceFolder) {
  const { activeTab } = vscode.window.tabGroups.activeTabGroup;
  if (!activeTab) throw "Tabs Shifter: There is no active tab.";
  if (!(activeTab.input instanceof vscode.TabInputText)) {
    throw "Tabs Shifter: Active tab is not text editor.";
  }
  const workspaceUri = String(workspaceFolder.uri);
  const activeTabUri = String(activeTab.input.uri);
  if (!activeTabUri.startsWith(workspaceUri)) {
    throw "Tabs Shifter: Active tab is not in the workspace folder.";
  }
  return activeTabUri.slice(workspaceUri.length).split("/").filter(Boolean)[0];
}

async function getDirectoryNames(
  workspaceFolder: vscode.WorkspaceFolder
): Promise<string[]> {
  const uri = String(workspaceFolder.uri);
  if (uri in directoryNamesCache) return directoryNamesCache[uri];
  const directories: Record<string, true> = {};
  const entries = await vscode.workspace.fs.readDirectory(workspaceFolder.uri);
  for (const [name, type] of entries) {
    if (type !== vscode.FileType.Directory) continue;
    directories[name] = true;
  }
  return (directoryNamesCache[uri] = Object.keys(directories));
}

function getWorkspaceFolder() {
  const { workspaceFolders } = vscode.workspace;
  if (!workspaceFolders || workspaceFolders.length < 1) {
    throw "Tabs Shifter: Please open the folder.";
  }
  if (workspaceFolders.length > 1) {
    throw "Tabs Shifter: Too many workspace folders.";
  }
  return workspaceFolders[0];
}

function cmd(fn: () => void) {
  return async () => {
    try {
      await fn();
    } catch (err) {
      if (typeof err === "string") {
        vscode.window.showErrorMessage(err);
      }
    }
  };
}
