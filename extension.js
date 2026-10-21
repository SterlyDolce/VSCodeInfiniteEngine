// @ts-nocheck
require('./Runtime/registerAlias')();

const vscode = require('vscode');
const path = require('path');

// ENGINE
const IEProject = require('./IEProject');
const IEActorInstance = require('./IEActorInstance');
const IEScene = require('./IEScene');
const IEEngine = require('./IEEngine');
const IEAssetManager = require('./IEAssetManager');
const IEAssetImporter = require('./IEAssetImporter');

// PANELS
const IEOutlinerProvider = require('./IEOutliner');
const IEPropertiesProvider = require('./IEProperties/IEPropertiesProvider');

// EDITORS
const IESceneEditor = require('./IESceneEditor/IESceneEditor');
const IEAssetEditorProvider = require('./IEAssetEditorProvider')
const IEModelViewer = require('./IEModelViewer/IEModelViewer');
const IEVisualScriptEditor = require('./IEVisualScriptEditor/IEVisualScriptEditor');
const IEActorAssetEditor = require('./IEActorAssetEditor/IEActorAssetEditor');
const IEMaterialEditor = require('./IEMaterialEditor/IEMaterialEditor');
const IEGeometryEditor = require('./IEGeometryEditor/IEGeometryEditor');
const IETextureEditor = require('./IETextureEditor/IETextureEditor');
const IEAnimationEditor = require('./IEAnimationEditor/IEAnimationEditor');
const IEAnimationStateEditor = require('./IEAnimationStateEditor/IEAnimationStateEditor');
const IESkeletonEditor = require('./IESkeletonEditor/IESkeletonEditor');
const IEWorldEditor = require('./IEWorldEditor/IEWorldEditor');
const IEAssetExplorer = require('./IEAssetExplorer');
const IEProjectEditor = require('./IEProjectEditor/IEProjectEditor');
const IEWelcomeEditor = require('./IEWelcomeEditor');


// REGISTRY
const ActorRegistry = require('./ActorRegistry');
const registerComponents = require('./Components/registerComponents');

registerComponents();


async function activate(context) {


	const assetExplorer = new IEAssetExplorer();

	const assetTreeView = vscode.window.createTreeView(
		'infinite.assetExplorer',
		{
			treeDataProvider: assetExplorer,
			dragAndDropController: assetExplorer,
			showCollapseAll: true
		}
	);

	const assetWatcher =
		vscode.workspace.createFileSystemWatcher('**/*');

	const refreshAssets = () => {
		assetExplorer.refresh();
	};

	const importAssets = async uris => {
		const workspace = vscode.workspace.workspaceFolders?.[0];
		if (!workspace) {
			vscode.window.showErrorMessage(
				'Open an Infinite Engine project before importing assets.'
			);
			return;
		}

		const importer = new IEAssetImporter(workspace.uri.fsPath);
		let selections = uris;
		if (!selections?.length) {
			selections = await vscode.window.showOpenDialog({
				canSelectFiles: true,
				canSelectFolders: false,
				canSelectMany: true,
				defaultUri: workspace.uri,
				filters: {
					'Importable Assets': importer.getSupportedExtensions()
				},
				openLabel: 'Import Assets'
			});
		}
		if (!selections?.length) return;

		const results = await vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: `Importing ${selections.length} asset${selections.length === 1 ? '' : 's'}`,
			cancellable: false
		}, () => importer.importFiles(selections.map(uri => uri.fsPath)));

		assetExplorer.refresh();
		const failures = results.filter(result => !result.success);
		const completed = results.filter(result => result.success && !result.pending);
		const pending = results.filter(result => result.success && result.pending);
		if (completed.length || pending.length) {
			vscode.window.showInformationMessage(
				`Imported ${completed.length} file${completed.length === 1 ? '' : 's'}` +
				(pending.length
					? `; opened ${pending.length} model${pending.length === 1 ? '' : 's'} for conversion.`
					: '.')
			);
		}
		if (failures.length) {
			vscode.window.showErrorMessage(failures.map(result =>
				`${path.basename(result.source)}: ${result.error}`
			).join(' | '));
		}
	};

	assetExplorer.setImportHandler(importAssets);

	const importAssetsCommand = vscode.commands.registerCommand(
		'infinite.importAssets',
		() => importAssets()
	);

	const importModelAssetCommand = vscode.commands.registerCommand(
		'infinite.importModelAsset',
		uri => IEModelViewer.import(uri)
	);

	const createAssetFolderCommand = vscode.commands.registerCommand(
		'infinite.createAssetFolder',
		async item => {
			const workspace = item?.resourceUri
				? vscode.workspace.getWorkspaceFolder(item.resourceUri)
				: vscode.workspace.workspaceFolders?.[0];
			if (!workspace) {
				vscode.window.showErrorMessage(
					'Open an Infinite Engine project before creating a folder.'
				);
				return;
			}

			const parentUri = item?.isDirectory
				? item.resourceUri
				: vscode.Uri.joinPath(workspace.uri, 'Assets');
			const folderName = await vscode.window.showInputBox({
				title: 'Create Asset Folder',
				prompt: `Folder name inside ${vscode.workspace.asRelativePath(parentUri) || 'Assets'}`,
				placeHolder: 'New Folder',
				validateInput(value) {
					const name = value.trim();
					if (!name) return 'Enter a folder name.';
					if (name === '.' || name === '..') return 'Choose another folder name.';
					if (/[\\/:*?"<>|\x00-\x1f]/.test(name)) {
						return 'Folder names cannot contain path separators or reserved characters.';
					}
					if (/[. ]$/.test(name)) {
						return 'Folder names cannot end with a period or space.';
					}
					return null;
				}
			});
			if (folderName === undefined) return;

			const folderUri = vscode.Uri.joinPath(parentUri, folderName.trim());
			try {
				await vscode.workspace.fs.stat(folderUri);
				vscode.window.showErrorMessage(
					`A file or folder named "${folderName.trim()}" already exists.`
				);
				return;
			} catch (error) {
				if (error?.code !== 'FileNotFound') {
					vscode.window.showErrorMessage(
						`Unable to check the destination: ${error instanceof Error ? error.message : String(error)}`
					);
					return;
				}
			}

			try {
				await vscode.workspace.fs.createDirectory(folderUri);
				assetExplorer.refresh(item?.isDirectory ? item : undefined);
				if (item?.isDirectory) {
					await assetTreeView.reveal(item, {
						expand: true,
						focus: true
					});
				}
			} catch (error) {
				vscode.window.showErrorMessage(
					`Failed to create asset folder: ${error instanceof Error ? error.message : String(error)}`
				);
			}
		}
	);

	assetWatcher.onDidChange(() => {
		assetExplorer.refresh();
	});

	context.subscriptions.push(
		assetExplorer,
		assetTreeView,
		assetWatcher,
		importAssetsCommand,
		importModelAssetCommand,
		createAssetFolderCommand,

		assetWatcher.onDidCreate(refreshAssets),
		assetWatcher.onDidDelete(refreshAssets),

		vscode.workspace.onDidChangeWorkspaceFolders(
			refreshAssets
		),

		vscode.commands.registerCommand(
			'infinite.refreshAssets',
			refreshAssets
		)
	);


	const gameOutput =
		vscode.window.createOutputChannel(
			'Infinite Engine'
		);

	await updateInfiniteProjectContext();

	await vscode.commands.executeCommand(
		'setContext',
		'infinite.isPlaying',
		false
	);

	await vscode.commands.executeCommand(
		'setContext',
		'infinite.isPaused',
		false
	);

	const ieProject = new IEProject(context);

	const sceneEditor = new IESceneEditor(context);
	sceneEditor.setPanelDisposeHandler(async () => {
		try {
			if (engine.running) engine.stop();
		} finally {
			await vscode.commands.executeCommand(
				'setContext',
				'infinite.isPlaying',
				false
			);
			await vscode.commands.executeCommand(
				'setContext',
				'infinite.isPaused',
				false
			);
		}
	});

	const outlinerProvider = new IEOutlinerProvider();

	const propertiesProvider = new IEPropertiesProvider(context, sceneEditor);

	sceneEditor.setSceneChangeHandler(async ({ sceneUri, scene, selection, selectedActorId }) => {
		outlinerProvider.setActors(scene.getActors());

		const actorId = selection?.actorId ?? selectedActorId;
		const actor = actorId ? scene.getActor(actorId) : null;
		if (actor) {
			propertiesProvider.setActor(actor, selection?.componentId ?? null);
			await outlinerProvider.revealActor(actor.id);
		} else {
			propertiesProvider.clear();
		}

		await context.workspaceState.update('activeSceneUri', sceneUri.toString());
	});


	const selectScriptItemCommand = vscode.commands.registerCommand(
		'infinite.selectScriptItem',
		async ({ uri, kind, id, functionId }) => {
			const active = vscode.window.tabGroups.activeTabGroup.activeTab;

			if (
				!(active?.input instanceof vscode.TabInputCustom) ||
				active.input.viewType !== 'infinite.assetEditor' ||
				active.input.uri.toString() !== uri
			) return;

			const document = await vscode.workspace.openTextDocument(
				vscode.Uri.parse(uri)
			);

			const asset = JSON.parse(document.getText());

			if (asset.type !== 'script') return;

			let item;

			if (kind === 'localVariable') {
				const fn = asset.data.functions?.find(
					fn => fn.id === functionId
				);

				item = fn?.variables?.find(v => v.id === id);
			} else if (kind === 'variable') {
				item = asset.data.variables?.find(v => v.id === id);
			} else if (kind === 'function') {
				item = asset.data.functions?.find(fn => fn.id === id);
			}

			if (!item) return;

			propertiesProvider.setGraphSelection({
				uri,
				selection: {
					type: kind === 'localVariable' ? 'variable' : kind,
					id: item.id,
					name: item.name,
					functionId: kind === 'localVariable' ? functionId : null,
					value: structuredClone(item)
				}
			});

			if (kind === 'function') {
				await IEVisualScriptEditor.openFunction(uri, id);
			}
		}
	);


	const engine = new IEEngine(context, gameOutput);
	let handlingRuntimeError = false;
	const reportRuntimeError = async payload => {
		if (handlingRuntimeError) return;
		handlingRuntimeError = true;
		try {
			const contextData = payload?.runtimeContext ?? payload?.context ?? {};
			const details = [
				contextData.phase,
				contextData.actor && `actor "${contextData.actor}"`,
				contextData.component && `component "${contextData.component}"`,
				contextData.node && `node "${contextData.node}"`
			].filter(Boolean).join(' · ');
			const message = payload?.message ?? String(payload);
			gameOutput.appendLine(`\n[Runtime Error]${details ? ` ${details}` : ''}`);
			gameOutput.appendLine(message);
			if (payload?.stack && payload.stack !== message) {
				gameOutput.appendLine(payload.stack);
			}
			gameOutput.show(true);
			vscode.window.showErrorMessage(
				`Infinite Engine stopped: ${details ? `${details}: ` : ''}${message}`
			);
			await vscode.commands.executeCommand('infinite.stop');
		} finally {
			handlingRuntimeError = false;
		}
	};

	engine.setErrorHandler(error => {
		void reportRuntimeError(error);
	});
	sceneEditor.setRuntimeErrorHandler(error => {
		void reportRuntimeError(error);
	});

	sceneEditor.setPrintHandler((...values) => {
		engine.print(...values);
	});


	// Workspace Listener

	const workspaceListener =
		vscode.workspace.onDidChangeWorkspaceFolders(
			async () => {
				await updateInfiniteProjectContext();
			}
		);


	// Initial Outliner Refresh

	await refreshOutlinerFromActiveScene(
		context,
		outlinerProvider
	);


	// Create Project

	const disposable =
		vscode.commands.registerCommand(
			'infinite.createProject',
			async () => {
				const result = await IEProjectEditor.open();

				if (!result) return;

				const {
					projectName,
					projectUri,
					shouldOpenProject
				} = result;

				try {
					await vscode.workspace.fs
						.createDirectory(
							projectUri
						);

					await initiateProject(
						ieProject.createProject(
							projectName,
							projectUri
						)
					);

					await updateInfiniteProjectContext();

					vscode.window
						.showInformationMessage(
							`Infinite project "${projectName}" created successfully.`
						);

					if (shouldOpenProject) {
						await context.globalState.update(
							'infinite.pendingProjectWelcome',
							projectUri.toString()
						);
						await vscode.commands
							.executeCommand(
								'vscode.openFolder',
								projectUri,
								false
							);
					}
				}
				catch (error) {
					const message =
						error instanceof Error
							? error.message
							: String(error);

					vscode.window
						.showErrorMessage(
							`Failed to create project: ${message}`
						);
				}
			}
		);


	// Play

	const playCommand =
		vscode.commands.registerCommand(
			'infinite.play',
			async () => {
				let sceneUri;
				try {
					const workspace =
						vscode.workspace
							.workspaceFolders?.[0];

					if (!workspace) {
						throw new Error(
							'No Infinite project is open.'
						);
					}

					if (engine.running) {
						throw new Error('Infinite Engine is already playing.');
					}

					const launch = await resolveProjectLaunch(
						workspace,
						context.workspaceState.get('activeSceneUri')
					);
					sceneUri = launch.sceneUri;
					// Reveal the launch scene even when its retained webview already
					// exists. Hidden webviews can reject runtime messages.
					await vscode.commands.executeCommand(
						'vscode.openWith',
						sceneUri,
						'infinite.sceneEditor'
					);

					const scene =
						new IEScene(
							sceneUri
						);

					await scene.load();

					const mainPath = launch.entryPath;

					delete require.cache[
						require.resolve(
							mainPath
						)
					];

					global.print =
						(...values) => {
							engine.print(
								...values
							);
						};

					const GameClass =
						require(
							mainPath
						);

					const game =
						new GameClass();

					engine.loadScene(
						scene
					);

					engine.setGame(
						game
					);

					await sceneEditor
						.beginPlay(
							sceneUri,
							engine
								.activeScene
								.toJSON()
						);

					engine.start();

					await vscode.commands
						.executeCommand(
							'setContext',
							'infinite.isPlaying',
							true
						);

					await vscode.commands
						.executeCommand(
							'setContext',
							'infinite.isPaused',
							false
						);
				}
				catch (error) {
					try {
						engine.stop();
					} catch (stopError) {
						console.error('Failed to roll back engine startup:', stopError);
					}
					if (sceneUri) {
						try {
							await sceneEditor.stopPlay(sceneUri);
						} catch (stopError) {
							console.error('Failed to roll back play mode:', stopError);
						}
					}
					await vscode.commands.executeCommand('setContext', 'infinite.isPlaying', false);
					await vscode.commands.executeCommand('setContext', 'infinite.isPaused', false);
					const message =
						error instanceof Error
							? error.message
							: String(error);

					vscode.window
						.showErrorMessage(
							`Failed to play: ${message}`
						);
				}
			}
		);


	// Pause

	const pauseCommand =
		vscode.commands.registerCommand(
			'infinite.pause',
			async () => {
				const activeSceneUriString =
					context.workspaceState.get(
						'activeSceneUri'
					);

				if (!activeSceneUriString) {
					return;
				}

				const sceneUri =
					vscode.Uri.parse(
						activeSceneUriString
					);

				engine.pause();

				await sceneEditor
					.pausePlay(
						sceneUri
					);

				await vscode.commands
					.executeCommand(
						'setContext',
						'infinite.isPaused',
						true
					);
			}
		);


	// Continue

	const continueCommand =
		vscode.commands.registerCommand(
			'infinite.continue',
			async () => {
				const activeSceneUriString =
					context.workspaceState.get(
						'activeSceneUri'
					);

				if (!activeSceneUriString) {
					return;
				}

				const sceneUri =
					vscode.Uri.parse(
						activeSceneUriString
					);

				engine.continue();

				await sceneEditor
					.continuePlay(
						sceneUri
					);

				await vscode.commands
					.executeCommand(
						'setContext',
						'infinite.isPaused',
						false
					);
			}
		);


	// Stop

	const stopCommand =
		vscode.commands.registerCommand(
			'infinite.stop',
			async () => {
				const activeSceneUriString =
					context.workspaceState.get(
						'activeSceneUri'
					);

				try {
					if (activeSceneUriString) {
						await sceneEditor.stopPlay(
							vscode.Uri.parse(activeSceneUriString)
						);
					}
				} finally {
					let stopError;
					try {
						engine.stop();
					} catch (error) {
						stopError = error;
					}
					await vscode.commands.executeCommand('setContext', 'infinite.isPlaying', false);
					await vscode.commands.executeCommand('setContext', 'infinite.isPaused', false);
					if (stopError) {
						const message = stopError instanceof Error ? stopError.message : String(stopError);
						vscode.window.showErrorMessage(`Failed to stop cleanly: ${message}`);
					}
				}
			}
		);


	// Scene Editor Provider

	const sceneEditorProvider =
		vscode.window
			.registerCustomEditorProvider(
				'infinite.sceneEditor',
				sceneEditor
			);


	// Outliner View

	const outlinerView = vscode.window.createTreeView(
		'infinite.outliner',
		{
			treeDataProvider: outlinerProvider,
			dragAndDropController: outlinerProvider,
			showCollapseAll: true
		}
	);

	outlinerProvider.setTreeView(outlinerView);
	IEVisualScriptEditor.outlinerProvider = outlinerProvider;
	outlinerProvider.setScriptDragHandler(item =>
		IEVisualScriptEditor.armScriptItem(item.uri, item)
	);


	outlinerProvider.setSceneReparentHandler(
		async (actorId, parentId) => {
			const tab = vscode.window.tabGroups
				.activeTabGroup.activeTab;

			const input = tab?.input;

			if (
				!(input instanceof vscode.TabInputCustom) ||
				input.viewType !== 'infinite.sceneEditor'
			) return;

			const sceneUri = input.uri;

			try {
				const snapshot = await sceneEditor.getSceneSnapshot(sceneUri);
				const { scene } = snapshot;

				const child = scene.getActor(actorId);
				const parent = scene.getActor(parentId);

				if (
					!child ||
					!parent ||
					child.type === 'World' ||
					child.id === parent.id
				) return;

				// Prevent creating a parenting cycle.
				const visited = new Set([child.id]);
				let current = parent;

				while (current) {
					if (visited.has(current.id)) return;

					visited.add(current.id);
					current = scene.getActor(current.parent);
				}

				if (child.parent === parent.id) return;

				child.parent = parent.id;

				await sceneEditor.commitSceneSnapshot(snapshot, {
					selectedActorId: child.id
				});

			} catch (error) {
				console.error(
					'[IE] Scene reparent failed:',
					error
				);

				vscode.window.showErrorMessage(
					`Unable to reparent Actor: ${error.message}`
				);
			}
		}
	);




	// Active Scene Listener


	const activeSceneListener = vscode.window.tabGroups.onDidChangeTabs(async () => {
		await refreshOutlinerFromActiveScene(
			context,
			outlinerProvider,
			propertiesProvider,
			sceneEditor
		);
		await propertiesProvider.syncActiveEditor();
	});

	const activeTabGroupListener = vscode.window.tabGroups.onDidChangeTabGroups(async () => {
		await refreshOutlinerFromActiveScene(
			context,
			outlinerProvider,
			propertiesProvider,
			sceneEditor
		);
		await propertiesProvider.syncActiveEditor();
	});



	// Select Actor

	const selectActorCommand =
		vscode.commands.registerCommand(
			'infinite.selectActor',
			async actorId => {
				const activeInput = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
				if (
					!(activeInput instanceof vscode.TabInputCustom) ||
					activeInput.viewType !== 'infinite.sceneEditor'
				) return;
				const sceneUri = activeInput.uri;

				try {
					const scene =
						new IEScene(
							sceneUri
						);

					await scene.load();

					const actor =
						scene.getActors().find(
							actor =>
								actor.id ===
								actorId
						);

					if (!actor) {
						return;
					}



					if (actor.isInstance()) {
						const workspace = vscode.workspace.getWorkspaceFolder(sceneUri);

						if (!workspace) {
							throw new Error('Scene workspace not found.');
						}

						const assetManager = new IEAssetManager(workspace.uri.fsPath);
						await assetManager.scan();

						const resolvedData = await IEActorInstance.resolve(
							actor.toJSON(),
							assetManager
						);

						const resolvedActor = ActorRegistry.fromJSON(resolvedData);

						propertiesProvider.setActor(resolvedActor);
					} else {
						propertiesProvider.setActor(actor);
					}



					await outlinerProvider
						.revealActor(
							actorId
						);


					sceneEditor.selectActor(
						sceneUri,
						actorId
					);
				}
				catch (error) {
					console.error(
						'Failed to select actor:',
						error
					);
				}
			}
		);


	// Add Actor


	const addActorCommand = vscode.commands.registerCommand(
		'infinite.addActor',
		async assetUri => {
			try {
				const activeSceneUriString = context.workspaceState.get(
					'activeSceneUri'
				);

				if (!activeSceneUriString) {
					vscode.window.showWarningMessage(
						'Open an Infinite scene first.'
					);
					return;
				}

				const sceneUri = vscode.Uri.parse(activeSceneUriString);

				if (!sceneUri.fsPath.toLowerCase().endsWith('.iescene')) {
					vscode.window.showWarningMessage(
						'The active file is not an Infinite scene.'
					);
					return;
				}

				const workspace = vscode.workspace.getWorkspaceFolder(sceneUri);

				if (!workspace) {
					throw new Error('Scene workspace not found.');
				}

				const snapshot = await sceneEditor.getSceneSnapshot(sceneUri);
				const { scene } = snapshot;

				let actor;

				const isAssetFile =
					assetUri instanceof vscode.Uri &&
					assetUri.path.toLowerCase().endsWith('.ieasset');

				if (isAssetFile) {
					const assetWorkspace = vscode.workspace.getWorkspaceFolder(
						assetUri
					);

					if (
						!assetWorkspace ||
						assetWorkspace.uri.toString() !== workspace.uri.toString()
					) {
						throw new Error(
							'Actor Asset must belong to the same project as the scene.'
						);
					}

					const content = Buffer.from(
						await vscode.workspace.fs.readFile(assetUri)
					).toString('utf8');

					const selectedAsset = JSON.parse(content);

					if (
						selectedAsset.type !== 'actor' ||
						typeof selectedAsset.id !== 'string'
					) {
						throw new Error(
							'The selected file is not an Actor Asset.'
						);
					}

					const assetManager = new IEAssetManager(
						workspace.uri.fsPath
					);

					await assetManager.scan();

					const entry = assetManager.index.get(selectedAsset.id);

					if (
						!entry ||
						entry.type !== 'actor' ||
						entry.path !== assetUri.fsPath
					) {
						throw new Error(
							'Actor Asset was not found in the project asset index.'
						);
					}

					actor = await scene.instantiateActor(
						{
							type: 'actor',
							id: selectedAsset.id
						},
						assetManager,
						scene.world.id
					);
				} else {
					const actorType = await vscode.window.showQuickPick(
						[
							'Empty Actor',
							'Mesh Actor',
							'Environment Actor',
							'Camera Actor',
							'Point Light Actor',
							'Directional Light Actor',
							'Spot Light Actor',
							'Actor Asset'
						],
						{
							title: 'Add Actor',
							placeHolder: 'Choose an actor type'
						}
					);

					if (!actorType) return;


					switch (actorType) {
						case 'Empty Actor':
							actor = ActorRegistry.create('Actor');
							actor.name = 'Empty Actor';
							actor.parent = scene.world.id;
							break;

						case 'Mesh Actor':
							actor = ActorRegistry.create('Mesh');
							actor.name = 'Mesh Actor';
							actor.parent = scene.world.id;
							break;

						case 'Camera Actor':
							actor = ActorRegistry.create('Camera');
							actor.name = 'Camera Actor';
							actor.parent = scene.world.id;
							console.log('Created:', actor);
							break;

						case 'Point Light Actor':
							actor = ActorRegistry.create('PointLight');
							actor.name = 'Point Light Actor';
							actor.parent = scene.world.id;
							break;

						case 'Directional Light Actor':
							actor = ActorRegistry.create('DirectionalLight');
							actor.name = 'Directional Light Actor';
							actor.parent = scene.world.id;
							break;

						case 'Spot Light Actor':
							actor = ActorRegistry.create('SpotLight');
							actor.name = 'Spot Light Actor';
							actor.parent = scene.world.id;
							break;

						case 'Environment Actor':
							actor = ActorRegistry.create("Environment")
							actor.name = "Environment"
							actor.parent = scene.world.id;
							break;

						case 'Actor Asset': {
							const assetManager = new IEAssetManager(
								workspace.uri.fsPath
							);

							await assetManager.scan();

							const assets = assetManager.getAssets('actor');

							if (!assets.length) {
								vscode.window.showWarningMessage(
									'No Actor Assets found in this project.'
								);
								return;
							}

							const selected = await vscode.window.showQuickPick(
								assets.map(asset => ({
									label: asset.name,
									description: asset.id,
									assetId: asset.id
								})),
								{
									title: 'Add Actor Asset',
									placeHolder: 'Choose an Actor Asset',
									matchOnDescription: true
								}
							);

							if (!selected) return;

							actor = await scene.instantiateActor(
								{
									type: 'actor',
									id: selected.assetId
								},
								assetManager,
								scene.world.id
							);

							break;
						}
					}


					if (!actor) {
						throw new Error('Invalid actor type.');
					}

					if (actorType !== 'Actor Asset') {
						scene.addActor(actor);
					}
				}

				await sceneEditor.commitSceneSnapshot(snapshot, {
					selectedActorId: actor.id
				});

				vscode.window.showInformationMessage(
					`${actor.name} added to ${scene.name}`
				);
			} catch (error) {
				const message = error instanceof Error
					? error.message
					: String(error);

				console.error('Failed to add actor:', error);

				vscode.window.showErrorMessage(
					`Failed to add actor: ${message}`
				);
			}
		}
	);


	const deleteActorCommand = vscode.commands.registerCommand(
		'infinite.deleteActor',
		async actorItem => {
			const actorId = actorItem?.id;
			if (!actorId) return;

			const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;

			if (
				!(input instanceof vscode.TabInputCustom) ||
				input.viewType !== 'infinite.sceneEditor'
			) return;

			const sceneUri = input.uri;

			try {
				const snapshot = await sceneEditor.getSceneSnapshot(sceneUri);
				const { scene } = snapshot;

				const actor = scene.getActors().find(a => a.id === actorId);

				if (!actor || actor.type === 'World') return;

				const descendants = new Set([actorId]);
				let previousSize;

				do {
					previousSize = descendants.size;

					for (const item of scene.getActors()) {
						if (descendants.has(item.parent)) {
							descendants.add(item.id);
						}
					}
				} while (descendants.size !== previousSize);

				const confirmation = await vscode.window.showWarningMessage(
					descendants.size > 1
						? `Delete "${actor.name}" and its ${descendants.size - 1} child actor(s)?`
						: `Delete "${actor.name}"?`,
					{ modal: true },
					'Delete'
				);

				if (confirmation !== 'Delete') return;

				const currentInput =
					vscode.window.tabGroups.activeTabGroup.activeTab?.input;

				if (
					!(currentInput instanceof vscode.TabInputCustom) ||
					currentInput.viewType !== 'infinite.sceneEditor' ||
					currentInput.uri.toString() !== sceneUri.toString()
				) return;

				for (const id of descendants) {
					scene.removeActor(id);
				}

				await sceneEditor.commitSceneSnapshot(snapshot);

			} catch (error) {
				console.error('Failed to delete actor:', error);
				vscode.window.showErrorMessage(
					`Failed to delete actor: ${error.message}`
				);
			}
		}
	);


	const createVariableCommand = vscode.commands.registerCommand(
		'infinite.createVariable',
		async () => {
			try {
				const result = await editActiveScriptAsset(async asset => {
					const variables = asset.data.variables;

					const name = await vscode.window.showInputBox({
						title: 'Create Variable',
						prompt: 'Enter the variable name',
						value: `Variable${variables.length + 1}`,
						validateInput: value => {
							const trimmed = value.trim();

							if (!trimmed) return 'Name is required.';

							if (variables.some(variable =>
								variable.name.toLowerCase() === trimmed.toLowerCase()
							)) {
								return 'A variable with this name already exists.';
							}

							return null;
						}
					});

					if (name === undefined) return null;

					const variable = {
						id: require('crypto').randomUUID(),
						name: name.trim(),
						type: 'number',
						value: 0
					};

					variables.push(variable);
					return variable;
				});

				if (!result) return;

				propertiesProvider.setGraphSelection({
					uri: result.uri.toString(),
					selection: {
						type: 'variable',
						id: result.item.id,
						name: result.item.name,
						functionId: null,
						value: structuredClone(result.item)
					}
				});

			} catch (error) {
				vscode.window.showErrorMessage(
					`Failed to create variable: ${error.message}`
				);
			}
		}
	);



	const deleteVariableCommand = vscode.commands.registerCommand(
		'infinite.deleteVariable',
		async variableItem => {
			if (variableItem?.kind !== 'variable') return;

			const variableId = variableItem.id;
			const scriptUri = outlinerProvider.script?.uri;

			if (!scriptUri) return;

			const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;

			if (
				!(input instanceof vscode.TabInputCustom) ||
				input.viewType !== 'infinite.assetEditor' ||
				input.uri.toString() !== scriptUri
			) return;

			try {
				const document = await vscode.workspace.openTextDocument(input.uri);
				const asset = JSON.parse(document.getText());

				if (asset.type !== 'script') return;

				const variables = asset.data?.variables ?? [];
				const variable = variables.find(v => v.id === variableId);

				if (!variable) return;

				const usedBy = (asset.data?.nodes ?? []).filter(
					node => node.variableId === variableId
				);

				if (usedBy.length) {
					vscode.window.showWarningMessage(
						`Cannot delete "${variable.name}". It is used by ${usedBy.length} node(s). Remove those nodes first.`
					);
					return;
				}

				const confirmation = await vscode.window.showWarningMessage(
					`Delete variable "${variable.name}"?`,
					{ modal: true },
					'Delete'
				);

				if (confirmation !== 'Delete') return;

				const activeInput =
					vscode.window.tabGroups.activeTabGroup.activeTab?.input;

				if (
					!(activeInput instanceof vscode.TabInputCustom) ||
					activeInput.viewType !== 'infinite.assetEditor' ||
					activeInput.uri.toString() !== scriptUri
				) return;

				// Re-read after confirmation to avoid overwriting
				// any edits made while the dialog was open.
				const latest = JSON.parse(document.getText());

				if (latest.type !== 'script') return;

				const current = latest.data?.variables?.find(
					v => v.id === variableId
				);

				if (!current) return;

				if ((latest.data?.nodes ?? []).some(
					node => node.variableId === variableId
				)) {
					vscode.window.showWarningMessage(
						'The variable is now being used by a node.'
					);
					return;
				}

				latest.data.variables = latest.data.variables.filter(
					v => v.id !== variableId
				);

				const edit = new vscode.WorkspaceEdit();

				const end = document.positionAt(document.getText().length);

				edit.replace(
					document.uri,
					new vscode.Range(0, 0, end.line, end.character),
					JSON.stringify(latest, null, 4) + '\n'
				);

				if (!await vscode.workspace.applyEdit(edit)) {
					throw new Error('Could not update the script asset.');
				}

				propertiesProvider.clearGraphSelection(scriptUri);

			} catch (error) {
				console.error('Failed to delete variable:', error);

				vscode.window.showErrorMessage(
					`Failed to delete variable: ${error.message}`
				);
			}
		}
	);


	const createFunctionCommand = vscode.commands.registerCommand(
		'infinite.createFunction',
		async () => {
			try {
				const result = await editActiveScriptAsset(async asset => {
					asset.data.functions ??= [];

					const functions = asset.data.functions;

					const name = await vscode.window.showInputBox({
						title: 'Create Function',
						prompt: 'Enter the function name',
						value: `Function${functions.length + 1}`,
						validateInput: value => {
							const trimmed = value.trim();

							if (!trimmed) return 'Name is required.';

							if (functions.some(fn =>
								fn.name.toLowerCase() === trimmed.toLowerCase()
							)) {
								return 'A function with this name already exists.';
							}

							return null;
						}
					});

					if (name === undefined) return null;


					const fn = {
						id: require('crypto').randomUUID(),
						name: name.trim(),
						inputs: [],
						outputs: [],
						variables: [],
						nodes: [],
						links: []
					};


					functions.push(fn);
					return fn;
				});

				if (!result) return;

				propertiesProvider.setGraphSelection({
					uri: result.uri.toString(),
					selection: {
						type: 'function',
						id: result.item.id,
						name: result.item.name,
						value: structuredClone(result.item)
					}
				});

			} catch (error) {
				vscode.window.showErrorMessage(
					`Failed to create function: ${error.message}`
				);
			}
		}
	);


	const deleteFunctionCommand = vscode.commands.registerCommand(
		'infinite.deleteFunction',
		async functionItem => {
			if (functionItem?.kind !== 'function') return;

			const functionId = functionItem.id;
			const scriptUri = outlinerProvider.script?.uri;
			if (!scriptUri) return;

			const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
			if (
				!(input instanceof vscode.TabInputCustom) ||
				input.viewType !== 'infinite.assetEditor' ||
				input.uri.toString() !== scriptUri
			) return;

			try {
				const document = await vscode.workspace.openTextDocument(input.uri);
				const asset = JSON.parse(document.getText());
				if (asset.type !== 'script') return;

				const fn = asset.data?.functions?.find(item => item.id === functionId);
				if (!fn) return;

				const graphs = [asset.data, ...(asset.data.functions ?? [])];
				const callCount = graphs.reduce(
					(total, graph) => total + (graph.nodes ?? []).filter(
						node => node.type === 'function.call' &&
							node.functionId === functionId
					).length,
					0
				);

				const detail = callCount
					? ` This will also remove ${callCount} Call node${callCount === 1 ? '' : 's'} and their connections.`
					: '';
				const confirmation = await vscode.window.showWarningMessage(
					`Delete function "${fn.name}"?${detail}`,
					{ modal: true },
					'Delete'
				);
				if (confirmation !== 'Delete') return;

				const latest = JSON.parse(document.getText());
				const current = latest.data?.functions?.find(
					item => item.id === functionId
				);
				if (!current) return;

				latest.data.functions = latest.data.functions.filter(
					item => item.id !== functionId
				);

				for (const graph of [latest.data, ...latest.data.functions]) {
					const removedPinIds = new Set(
						(graph.nodes ?? [])
							.filter(node =>
								node.type === 'function.call' &&
								node.functionId === functionId
							)
							.flatMap(node => (node.pins ?? []).map(pin => pin.id))
					);

					graph.nodes = (graph.nodes ?? []).filter(node =>
						node.type !== 'function.call' || node.functionId !== functionId
					);
					graph.links = (graph.links ?? []).filter(link =>
						!removedPinIds.has(link.from) && !removedPinIds.has(link.to)
					);
				}

				const edit = new vscode.WorkspaceEdit();
				const end = document.positionAt(document.getText().length);
				edit.replace(
					document.uri,
					new vscode.Range(0, 0, end.line, end.character),
					JSON.stringify(latest, null, 4) + '\n'
				);

				if (!await vscode.workspace.applyEdit(edit)) {
					throw new Error('Could not update the script asset.');
				}

				propertiesProvider.clearGraphSelection(scriptUri);
			} catch (error) {
				console.error('Failed to delete function:', error);
				vscode.window.showErrorMessage(
					`Failed to delete function: ${error.message}`
				);
			}
		}
	);


	const createLocalVariableCommand = vscode.commands.registerCommand(
		'infinite.createLocalVariable',
		async item => {
			const functionId = item?.functionId;
			if (!functionId) return;

			try {
				const result = await editActiveScriptAsset(async asset => {
					const fn = asset.data.functions?.find(
						fn => fn.id === functionId
					);

					if (!fn) return null;

					fn.variables ??= [];

					const name = await vscode.window.showInputBox({
						title: `New Local Variable — ${fn.name}`,
						value: `Variable${fn.variables.length + 1}`,
						validateInput: value => {
							const trimmed = value.trim();

							if (!trimmed) return 'Name is required.';

							const taken = [
								...asset.data.variables,
								...fn.variables
							].some(variable =>
								variable.name.toLowerCase() === trimmed.toLowerCase()
							);

							return taken
								? 'A variable with this name already exists in scope.'
								: null;
						}
					});

					if (name === undefined) return null;

					const variable = {
						id: require('crypto').randomUUID(),
						name: name.trim(),
						type: 'number',
						value: 0
					};

					fn.variables.push(variable);
					return variable;
				});

				if (!result) return;

				propertiesProvider.setGraphSelection({
					uri: result.uri.toString(),
					selection: {
						type: 'variable',
						id: result.item.id,
						name: result.item.name,
						value: structuredClone(result.item),
						functionId
					}
				});

			} catch (error) {
				vscode.window.showErrorMessage(
					`Failed to create local variable: ${error.message}`
				);
			}
		}
	);


	const addAnimationLayerCommand =
		vscode.commands.registerCommand(
			'infinite.addAnimationLayer',
			async () => {
				const canvas = propertiesProvider.animationStateCanvas;

				if (!canvas) return;

				await canvas.panel.webview.postMessage({
					type: 'addAnimationLayer'
				});
			}
		);

	const addAnimationParameterCommand =
		vscode.commands.registerCommand(
			'infinite.addAnimationParameter',
			async () => {
				const canvas = propertiesProvider.animationStateCanvas;

				if (!canvas) return;

				await canvas.panel.webview.postMessage({
					type: 'addAnimationParameter'
				});
			}
		);



	const deleteAnimationLayerCommand =
		vscode.commands.registerCommand(
			'infinite.deleteAnimationLayer',
			async item => {
				if (item?.kind !== 'animationLayer') return;

				const canvas =
					propertiesProvider.animationStateCanvas;

				if (
					!canvas ||
					canvas.uri !== outlinerProvider.animationState?.uri
				) return;

				if (
					outlinerProvider.animationState.layers.length <= 1
				) {
					vscode.window.showWarningMessage(
						'An Animation State must have at least one layer.'
					);
					return;
				}

				const choice = await vscode.window.showWarningMessage(
					`Delete layer "${item.name}" and all its states and transitions?`,
					{ modal: true },
					'Delete'
				);

				if (choice !== 'Delete') return;

				await canvas.panel.webview.postMessage({
					type: 'deleteAnimationLayer',
					layerId: item.id
				});
			}
		);

	const deleteAnimationParameterCommand =
		vscode.commands.registerCommand(
			'infinite.deleteAnimationParameter',
			async item => {
				if (item?.kind !== 'animationParameter') return;

				const canvas =
					propertiesProvider.animationStateCanvas;

				if (
					!canvas ||
					canvas.uri !== outlinerProvider.animationState?.uri
				) return;

				const choice = await vscode.window.showWarningMessage(
					`Delete animation parameter "${item.name}"?`,
					{ modal: true },
					'Delete'
				);

				if (choice !== 'Delete') return;

				await canvas.panel.webview.postMessage({
					type: 'deleteAnimationParameter',
					name: item.name
				});
			}
		);



	const selectAnimationStateItemCommand =
		vscode.commands.registerCommand(
			'infinite.selectAnimationStateItem',
			async ({ uri, kind, id }) => {
				const tab =
					vscode.window.tabGroups.activeTabGroup.activeTab;

				const input = tab?.input;

				if (
					!(input instanceof vscode.TabInputCustom) ||
					input.viewType !== 'infinite.assetEditor' ||
					input.uri.toString() !== uri
				) return;

				const document =
					await vscode.workspace.openTextDocument(input.uri);

				const asset = JSON.parse(document.getText());

				if (asset.type !== 'animationState') return;

				const item = kind === 'animationLayer'
					? asset.data?.layers?.find(layer => layer.id === id)
					: asset.data?.parameters?.find(param => param.name === id);

				if (!item) return;

				// Selection will be connected to the Properties panel
				// in the next step.
				console.log('[IE] Animation State selection:', {
					kind,
					id,
					item
				});
				propertiesProvider.setAnimationStateSelection({
					uri,
					kind,
					id
				});
			}
		);


	// Properties View

	const propertiesView = vscode.window.registerWebviewViewProvider(
		'infinite.properties',
		propertiesProvider
	);
	await propertiesProvider.syncActiveEditor();

	const modelViewerProvider = vscode.window.registerCustomEditorProvider(
		'infinite.modelViewer',
		new IEModelViewer(context),
		{
			webviewOptions: {
				retainContextWhenHidden: true
			}
		}
	)

	IEActorAssetEditor.outlinerProvider = outlinerProvider;
	IESkeletonEditor.outlinerProvider = outlinerProvider;

	outlinerProvider.setReparentHandler(
		async (uri, componentId, parentId) => {
			const editor = IEActorAssetEditor.selections.get(uri);

			if (!editor?.reparent) {
				console.warn(
					'[IE] No Actor Editor available for reparenting:',
					uri
				);
				return;
			}

			await editor.reparent(
				uri,
				componentId,
				parentId
			);
		}
	);



	IEAssetEditorProvider.register('script', IEVisualScriptEditor);
	IEAssetEditorProvider.register('actor', IEActorAssetEditor);
	IEAssetEditorProvider.register('material', IEMaterialEditor);
	IEAssetEditorProvider.register('geometry', IEGeometryEditor);
	IEAssetEditorProvider.register('texture', IETextureEditor);
	IEAssetEditorProvider.register('animation', IEAnimationEditor);
	IEAssetEditorProvider.register('animationState', IEAnimationStateEditor);
	IEAssetEditorProvider.register('skeleton', IESkeletonEditor);
	IEAssetEditorProvider.register('terrain', IEWorldEditor);

	const selectSkeletonNodeCommand = vscode.commands.registerCommand(
		'infinite.selectSkeletonNode',
		async ({ uri, nodeId }) => {
			const tab = vscode.window.tabGroups.activeTabGroup.activeTab;
			if (tab?.input?.uri?.toString() !== uri) return;
			await IESkeletonEditor.editors.get(uri)?.select(nodeId);
		}
	);


	const selectActorAssetComponent = vscode.commands.registerCommand(
		'infinite.selectActorAssetComponent',
		async ({ uri, componentId }) => {
			const tab = vscode.window.tabGroups.activeTabGroup.activeTab;

			if (tab?.input?.uri?.toString() !== uri) return;

			const editor = IEActorAssetEditor.selections.get(uri);
			if (!editor) return;

			await editor.select(componentId);
		}
	)

	const addComponentCommand = vscode.commands.registerCommand(
		'infinite.addComponent',
		async () => {
			const input = vscode.window.tabGroups
				.activeTabGroup.activeTab?.input;

			if (
				!(input instanceof vscode.TabInputCustom) ||
				input.viewType !== 'infinite.assetEditor'
			) return;

			const uri = input.uri.toString();
			const editor = IEActorAssetEditor.selections.get(uri);

			if (!editor?.addComponent) return;

			const { getComponentTypes } = require(
				'./Components/createComponent'
			);

			const selected = await vscode.window.showQuickPick(
				getComponentTypes().map(item => ({
					label: `$(${item.icon}) ${item.label}`,
					componentType: item.type
				})),
				{
					title: 'Add Component',
					placeHolder: 'Search components...'
				}
			);

			if (!selected) return;

			// Make sure we're still editing the same Actor Asset.
			const current = vscode.window.tabGroups
				.activeTabGroup.activeTab?.input;

			if (current?.uri?.toString() !== uri) return;

			await editor.addComponent(selected.componentType);
		}
	);


	const deleteComponentCommand =
		vscode.commands.registerCommand(
			'infinite.deleteComponent',
			async item => {
				if (item?.kind !== 'assetComponent') return;

				const input = vscode.window.tabGroups
					.activeTabGroup.activeTab?.input;

				if (
					!(input instanceof vscode.TabInputCustom) ||
					input.viewType !== 'infinite.assetEditor'
				) return;

				const uri = input.uri.toString();

				// Make sure the clicked Outliner item belongs
				// to the currently active Actor Asset.
				if (
					outlinerProvider.mode !== 'actor' ||
					outlinerProvider.actorAsset?.uri !== uri
				) return;

				const editor =
					IEActorAssetEditor.selections.get(uri);

				if (!editor?.deleteComponent) return;

				await editor.deleteComponent(item.id);
			}
		);




	const assetEditorProvider = vscode.window.registerCustomEditorProvider(
		'infinite.assetEditor',
		new IEAssetEditorProvider(context, propertiesProvider),
		{
			webviewOptions: {
				retainContextWhenHidden: true
			},
			supportsMultipleEditorsPerDocument: false
		}
	)

	const scriptOutlinerListener = vscode.workspace.onDidChangeTextDocument(
		event => {
			const tab = vscode.window.tabGroups.activeTabGroup.activeTab;
			const input = tab?.input;

			if (!(input instanceof vscode.TabInputCustom)) return;
			if (input.viewType !== 'infinite.assetEditor') return;
			if (input.uri.toString() !== event.document.uri.toString()) return;

			try {
				const asset = JSON.parse(event.document.getText());

				if (asset.type === 'script') {
					outlinerProvider.setScript(asset, input.uri);
				} else if (asset.type === 'animationState') {
					outlinerProvider.setAnimationState(asset, input.uri);
				} else if (asset.type === 'skeleton') {
					outlinerProvider.setSkeleton(asset, input.uri);
				}
			} catch {
				// Ignore temporarily invalid JSON while editing.
			}
		}
	);

	const IEAssetCreator = require('./IEAssetCreator/IEAssetCreator');
	const {
		createTemplate,
		getTemplates
	} = require('./IEActorAssetEditor/IEAssetTemplates');

	context.subscriptions.push(
		vscode.commands.registerCommand(
			'infinite.createAsset',
			async (folderUri) => {
				const folder = folderUri instanceof vscode.Uri
					? folderUri
					: vscode.workspace.workspaceFolders?.[0]
						? vscode.Uri.joinPath(
							vscode.workspace.workspaceFolders[0].uri,
							'Assets'
						)
						: null;

				if (!folder) {
					vscode.window.showErrorMessage(
						'Open an Infinite Engine project first.'
					);
					return;
				}

				const selection = await IEAssetCreator.open(context);
				if (!selection) return;

				const name = selection.name.trim();

				if (
					!name ||
					name === '.' ||
					name === '..' ||
					/[\\/:*?"<>|]/.test(name)
				) {
					vscode.window.showErrorMessage('Invalid asset name.');
					return;
				}

				const template = getTemplates().find(
					item => item.type === selection.type
				);
				if (!template) {
					vscode.window.showErrorMessage('Unknown asset template.');
					return;
				}

				const targetFolder = selection.type === 'scene'
					? vscode.Uri.joinPath(
						vscode.workspace.workspaceFolders[0].uri,
						'Scenes'
					)
					: folder;
				await vscode.workspace.fs.createDirectory(targetFolder);

				const uri = vscode.Uri.joinPath(
					targetFolder,
					`${name}${template.extension}`
				);

				try {
					await vscode.workspace.fs.stat(uri);

					vscode.window.showErrorMessage(
						`An asset named "${name}" already exists.`
					);
					return;
				} catch (error) {
					if (error.code !== 'FileNotFound') {
						throw error;
					}
				}

				const asset = createTemplate(selection.type, name);

				await vscode.workspace.fs.writeFile(
					uri,
					Buffer.from(JSON.stringify(asset, null, 4) + '\n')
				);

				await vscode.commands.executeCommand(
					'vscode.open',
					uri
				);
			}
		)
	);

	const IEProjectManagerProvider =
		require('./IEProjectManagerProvider');

	// Inside activate(context)
	const projectManager = new IEProjectManagerProvider(context);

	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(
			IEProjectManagerProvider.viewType,
			projectManager
		)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			'infinite.onPropertyUpdate',
			async ({ data, editor }) => {
				if (!editor) return;

				try {
					switch (editor.type) {
						case 'scene':
							return await sceneEditor.updateProperty(
								vscode.Uri.parse(editor.uri),
								data
							);

						case 'asset':
							switch (editor.assetType) {
								case 'actor':
									return await propertiesProvider.updateActorAssetProperty(
										data.target === 'component' ? data.id : null,
										data.property,
										data.value
									);

								case 'script':
								case 'material':
								case 'terrain':
									if (data.target === 'functionParameter') {
										return await propertiesProvider.updateFunctionParameter({
											functionId: data.id,
											direction: data.property,
											operation: data.value?.operation,
											parameterId: data.value?.parameterId,
											changes: data.value?.changes ?? {}
										});
									}

									return await propertiesProvider.updateGraphProperty({
										...data,
										selectionType: data.target,
										functionId: data.functionId ?? null
									});

								case 'animationState':
									return await propertiesProvider.updateAnimationStateProperty(data);

								case 'skeleton':
									return await propertiesProvider.updateSkeletonProperty(data);
							}
							return;
					}
				} catch (error) {
					const message = error instanceof Error
						? error.message
						: String(error);

					console.error('Failed to update property:', error);
					vscode.window.showErrorMessage(
						`Unable to update property: ${message}`
					);
				}
			}
		)
	);


	// Subscriptions

	context.subscriptions.push(
		disposable,
		sceneEditorProvider,
		outlinerView,
		selectActorCommand,
		addActorCommand,
		activeSceneListener,
		propertiesView,
		gameOutput,
		playCommand,
		stopCommand,
		pauseCommand,
		continueCommand,
		workspaceListener,
		modelViewerProvider,
		assetEditorProvider,
		activeTabGroupListener,
		selectScriptItemCommand,
		scriptOutlinerListener,
		deleteActorCommand,
		deleteVariableCommand,
		deleteFunctionCommand,
		createVariableCommand,
		createFunctionCommand,
		createLocalVariableCommand,
		selectActorAssetComponent,
		addComponentCommand,
		deleteComponentCommand,
		selectAnimationStateItemCommand,
		selectSkeletonNodeCommand,
		addAnimationLayerCommand,
		addAnimationParameterCommand,
		deleteAnimationLayerCommand,
		deleteAnimationParameterCommand
	);

	await openPendingProjectExperience(context, gameOutput);
}

async function openPendingProjectExperience(context, gameOutput) {
	const workspace = vscode.workspace.workspaceFolders?.[0];
	const pending = context.globalState.get('infinite.pendingProjectWelcome');
	if (!workspace || pending !== workspace.uri.toString()) return;
	await context.globalState.update('infinite.pendingProjectWelcome', undefined);
	await vscode.commands.executeCommand('workbench.view.extension.infinite-engine');
	await vscode.commands.executeCommand('workbench.view.extension.infinite-properties');
	await vscode.commands.executeCommand('infinite.properties.focus');
	IEWelcomeEditor.open(workspace.name);
	gameOutput.show(true);
}



async function editActiveScriptAsset(mutator) {
	const tab = vscode.window.tabGroups.activeTabGroup.activeTab;
	const input = tab?.input;

	if (
		!(input instanceof vscode.TabInputCustom) ||
		input.viewType !== 'infinite.assetEditor'
	) {
		vscode.window.showWarningMessage('Open a Visual Script Asset first.');
		return null;
	}

	const uri = input.uri;
	const document = await vscode.workspace.openTextDocument(uri);
	const version = document.version;

	let asset;

	try {
		asset = JSON.parse(document.getText());
	} catch {
		vscode.window.showErrorMessage('Invalid Visual Script Asset JSON.');
		return null;
	}

	if (
		asset.type !== 'script' ||
		!Array.isArray(asset.data?.nodes) ||
		!Array.isArray(asset.data?.links) ||
		!Array.isArray(asset.data?.variables)
	) {
		vscode.window.showErrorMessage('The active asset is not a Visual Script.');
		return null;
	}

	const result = await mutator(asset);
	if (!result) return null;

	const active = vscode.window.tabGroups.activeTabGroup.activeTab?.input;

	if (
		!(active instanceof vscode.TabInputCustom) ||
		active.viewType !== 'infinite.assetEditor' ||
		active.uri.toString() !== uri.toString()
	) return null;

	if (document.version !== version) {
		vscode.window.showWarningMessage(
			'The script changed while creating the item. Please try again.'
		);
		return null;
	}

	const edit = new vscode.WorkspaceEdit();
	const end = document.positionAt(document.getText().length);

	edit.replace(
		uri,
		new vscode.Range(0, 0, end.line, end.character),
		JSON.stringify(asset, null, 4) + '\n'
	);

	if (!await vscode.workspace.applyEdit(edit)) {
		throw new Error('Failed to update the Visual Script Asset.');
	}

	return {
		uri,
		item: result
	};
}



async function updateInfiniteProjectContext() {
	const workspace =
		vscode.workspace
			.workspaceFolders?.[0];

	if (!workspace) {
		await vscode.commands
			.executeCommand(
				'setContext',
				'infinite.projectOpen',
				false
			);

		return;
	}

	const projectFile =
		vscode.Uri.joinPath(
			workspace.uri,
			'Infinite.ieproject'
		);

	try {
		await vscode.workspace.fs.stat(
			projectFile
		);

		await vscode.commands
			.executeCommand(
				'setContext',
				'infinite.projectOpen',
				true
			);
	}
	catch {
		await vscode.commands
			.executeCommand(
				'setContext',
				'infinite.projectOpen',
				false
			);
	}
}

async function resolveProjectLaunch(workspace, activeSceneUriString) {
	const projectFile = vscode.Uri.joinPath(workspace.uri, 'Infinite.ieproject');
	let project;

	try {
		const bytes = await vscode.workspace.fs.readFile(projectFile);
		project = JSON.parse(Buffer.from(bytes).toString('utf8'));
	} catch (error) {
		throw new Error(
			`Unable to read Infinite.ieproject: ${error instanceof Error ? error.message : String(error)}`
		);
	}

	const projectRoot = workspace.uri.fsPath;
	const resolveInsideProject = (value, label) => {
		if (typeof value !== 'string' || !value.trim()) {
			throw new Error(`Infinite.ieproject does not define ${label}.`);
		}

		const resolved = path.resolve(projectRoot, value);
		const relative = path.relative(projectRoot, resolved);
		if (relative.startsWith('..') || path.isAbsolute(relative)) {
			throw new Error(`${label} must stay inside the project folder.`);
		}
		return resolved;
	};

	let sceneUri;
	if (activeSceneUriString) {
		const candidate = vscode.Uri.parse(activeSceneUriString);
		if (
			candidate.fsPath.toLowerCase().endsWith('.iescene') &&
			vscode.workspace.getWorkspaceFolder(candidate)?.uri.toString() === workspace.uri.toString()
		) {
			sceneUri = candidate;
		}
	}

	if (!sceneUri) {
		sceneUri = vscode.Uri.file(resolveInsideProject(project.startScene, 'startScene'));
	}

	return {
		sceneUri,
		entryPath: resolveInsideProject(project.entry ?? 'main.js', 'entry')
	};
}


async function initiateProject(
	ieProject
) {
	await ieProject.init();

	return ieProject;
}



async function refreshOutlinerFromActiveScene(
	context,
	outlinerProvider,
	propertiesProvider,
	sceneEditor
) {
	const tab = vscode.window.tabGroups.activeTabGroup.activeTab;
	const input = tab?.input;

	if (!(input instanceof vscode.TabInputCustom)) {
		outlinerProvider.clear();
		return;
	}

	if (input.viewType === 'infinite.assetEditor') {
		try {
			const document = await vscode.workspace.openTextDocument(input.uri);
			const asset = JSON.parse(document.getText());

			if (asset.type === 'script') {
				outlinerProvider.setScript(asset, input.uri);
			} else if (asset.type === 'animationState') {
				outlinerProvider.setAnimationState(asset, input.uri);
			} else if (asset.type === 'actor') {
				outlinerProvider.setActorAsset(asset, input.uri);
			} else if (asset.type === 'skeleton') {
				outlinerProvider.setSkeleton(asset, input.uri);
			} else {
				outlinerProvider.clear();
			}
		} catch (error) {
			console.error('Failed to load script into Outliner:', error);
			outlinerProvider.clear();
		}

		return;
	}

	if (input.viewType !== 'infinite.sceneEditor') {
		outlinerProvider.clear();
		return;
	}

	const sceneUri = input.uri;

	await context.workspaceState.update(
		'activeSceneUri',
		sceneUri.toString()
	);

	try {
		const scene = new IEScene(sceneUri);
		await scene.load();

		outlinerProvider.setActors(scene.getActors());
		const selection = sceneEditor?.getSelection(sceneUri);
		const actor = selection?.actorId
			? scene.getActor(selection.actorId)
			: null;
		if (actor) {
			propertiesProvider?.setActor(actor, selection.componentId);
			await outlinerProvider.revealActor(actor.id);
		} else {
			propertiesProvider?.clear();
		}
	} catch (error) {
		console.error('Failed to load scene into Outliner:', error);
		outlinerProvider.clear();
	}
}



function deactivate() { }


module.exports = {
	activate,
	deactivate
};
