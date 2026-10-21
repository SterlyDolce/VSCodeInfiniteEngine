// @ts-nocheck
const vscode = require('vscode');
const fs = require('fs');
const IEScene = require('../IEScene');
const IEActorInstance = require('../IEActorInstance');
const IEAssetManager = require('../IEAssetManager');
const ActorRegistry = require('../ActorRegistry');
const registerActors = require('../Actors/registerActors');
const IETerrainGraphEvaluator = require('../IEWorldEditor/IETerrainGraphEvaluator');
const { resolveTerrainTextures, resolveTerrainMaterials } = require('../IEWorldEditor/IETextureDataDecoder');
const crypto = require('crypto');
const { findCustomNodeFiles } = require('../IECustomNodeLoader');

registerActors();

class IESceneEditor {

	constructor(context) {
		this.context = context;

		this.panels = new Map();
		this.sceneSelections = new Map();
		this.sceneEditQueues = new Map();
		this.editorStateMemory = new Map();
		this.sceneLifecycles = new Map();
		this.sceneLoadVersions = new Map();
		this.pendingPlayRefreshes = new Set();
		this.playStartRequests = new Map();
		this.sceneChangeHandler = undefined;
		this.runtimeErrorHandler = undefined;
		this.panelDisposeHandler = undefined;
		this.assetDrag = null;
	}

	async armAssetDrop(item) {
		this.assetDrag = { item: structuredClone(item), startedAt: Date.now() };
		const panels = [...this.panels.entries()];
		await Promise.all(panels.map(([, panel]) =>
			panel.webview.postMessage({ type: 'armAssetDrop', item })
		));
		for (const [sceneKey, panel] of panels) {
			void this.resolveActorPreview(vscode.Uri.parse(sceneKey), item)
				.then(actor => {
					if (!actor || this.assetDrag?.item?.uri !== item.uri) return;
					return panel.webview.postMessage({ type: 'armAssetDrop', item, actor });
				})
				.catch(error => console.warn(
					'Unable to prepare Actor Asset placement preview:', error
				));
		}
	}

	async resolveActorPreview(sceneUri, item) {
		if (item?.type !== 'actor' || typeof item.uri !== 'string') return null;
		const assetUri = vscode.Uri.parse(item.uri);
		const workspace = vscode.workspace.getWorkspaceFolder(sceneUri);
		if (!workspace || vscode.workspace.getWorkspaceFolder(assetUri)?.uri.toString() !== workspace.uri.toString()) return null;

		const asset = JSON.parse(Buffer.from(
			await vscode.workspace.fs.readFile(assetUri)
		).toString('utf8'));
		if (asset.type !== 'actor') return null;

		const manager = new IEAssetManager(workspace.uri.fsPath);
		await manager.scan();
		const instance = IEActorInstance.create(asset);
		const actor = await IEActorInstance.resolve(instance.toJSON(), manager);

		for (const component of actor.components ?? []) {
			if (component.type !== 'mesh') continue;
			const geometry = await manager.resolve(component.geometry);
			component.resolvedGeometry = geometry?.type === 'geometry' ? geometry.data : null;
			component.resolvedMaterials = await Promise.all(
				(component.materials ?? []).map(reference =>
					manager.resolveMaterialForScene(reference)
				)
			);
			if (component.skinned) {
				const skeleton = await manager.resolve(component.skeleton);
				component.resolvedSkeleton = skeleton?.type === 'skeleton' ? skeleton.data : null;
			}
		}

		return actor;
	}

	getActiveAssetDrag() {
		if (!this.assetDrag || Date.now() - this.assetDrag.startedAt > 30000) {
			return null;
		}
		return structuredClone(this.assetDrag.item);
	}

	queueSceneEdit(sceneUri, operation) {
		const key = sceneUri.toString();
		const previous = this.sceneEditQueues.get(key) ?? Promise.resolve();
		const result = previous.catch(() => undefined).then(operation);
		const cleanup = () => {
			if (this.sceneEditQueues.get(key) === tracked) {
				this.sceneEditQueues.delete(key);
			}
		};
		const tracked = result.then(cleanup, cleanup);
		this.sceneEditQueues.set(key, tracked);
		return result;
	}

	async waitForSceneEdits(sceneUri) {
		await this.sceneEditQueues.get(sceneUri.toString())?.catch(() => undefined);
	}

	async resolveCustomTextEditor(document, webviewPanel) {
		const sceneKey = document.uri.toString();

		this.panels.set(
			sceneKey,
			webviewPanel
		);
		this.sceneLifecycles.set(sceneKey, 'editing');

		await this.context.workspaceState.update(
			'activeSceneUri',
			sceneKey
		);

		webviewPanel.onDidDispose(() => {
			const lifecycle = this.sceneLifecycles.get(sceneKey);
			this.panels.delete(sceneKey);
			this.sceneSelections.delete(sceneKey);
			this.sceneLoadVersions.set(
				sceneKey,
				(this.sceneLoadVersions.get(sceneKey) ?? 0) + 1
			);
			this.sceneLifecycles.delete(sceneKey);
			this.pendingPlayRefreshes.delete(sceneKey);
			for (const [requestId, request] of this.playStartRequests) {
				if (request.sceneKey !== sceneKey) continue;
				clearTimeout(request.timer);
				request.reject(new Error('Scene editor closed while play mode was starting.'));
				this.playStartRequests.delete(requestId);
			}
			if (['starting', 'playing', 'paused', 'stopping'].includes(lifecycle)) {
				void Promise.resolve(
					this.panelDisposeHandler?.(document.uri, lifecycle)
				).catch(error => console.error(
					'Failed to clean up disposed scene runtime:',
					error
				));
			}
		});

		const sceneUndoWatcher = vscode.workspace.onDidChangeTextDocument(event => {
			if (event.document.uri.toString() !== sceneKey) return;
			if (![
				vscode.TextDocumentChangeReason.Undo,
				vscode.TextDocumentChangeReason.Redo
			].includes(event.reason)) return;

			void this.syncSceneAfterHistoryChange(document.uri).catch(error => {
				console.error('Failed to synchronize scene history:', error);
				vscode.window.showErrorMessage(
					`Failed to refresh scene after undo/redo: ${error instanceof Error ? error.message : String(error)}`
				);
			});
		});
		webviewPanel.onDidDispose(() => sceneUndoWatcher.dispose());

		const terrainWatcher = vscode.workspace.onDidChangeTextDocument(event => {
			if (event.document.uri.toString() === document.uri.toString() || !event.document.uri.path.endsWith('.ieasset')) return;
			try {
				if (JSON.parse(event.document.getText()).type === 'terrain') void this.refreshScene(document.uri);
			} catch { /* An incomplete asset edit is ignored until it is valid. */ }
		});
		webviewPanel.onDidDispose(() => terrainWatcher.dispose());

		webviewPanel.webview.options = {
			enableScripts: true,
			localResourceRoots: [
				...(vscode.workspace.getWorkspaceFolder(document.uri)
					? [vscode.workspace.getWorkspaceFolder(document.uri).uri]
					: []),
				vscode.Uri.joinPath(
					this.context.extensionUri,
					'IESceneEditor'
				),
				vscode.Uri.joinPath(
					this.context.extensionUri,
					'node_modules'
				),
				vscode.Uri.joinPath(
					this.context.extensionUri,
					'Models'
				),
				vscode.Uri.joinPath(
					this.context.extensionUri,
					'images'
				)
			]
		};

		const editorPath = vscode.Uri.joinPath(
			this.context.extensionUri,
			'IESceneEditor'
		);

		const htmlPath = vscode.Uri.joinPath(
			editorPath,
			'index.html'
		);

		const stylePath = vscode.Uri.joinPath(
			editorPath,
			'style.css'
		);

		const scriptPath = vscode.Uri.joinPath(
			editorPath,
			'script.mjs'
		);

		const threePath = vscode.Uri.joinPath(
			this.context.extensionUri,
			'node_modules',
			'three',
			'build',
			'three.module.js'
		);

		const threeAddonsPath = vscode.Uri.joinPath(
			this.context.extensionUri,
			'node_modules',
			'three',
			'examples',
			'jsm'
		);

		const rapierPath = vscode.Uri.joinPath(
			this.context.extensionUri,
			'node_modules',
			'@dimforge',
			'rapier3d-compat',
			'dist',
			'rapier.mjs'
		);

		const cameraModelPath = vscode.Uri.joinPath(
			this.context.extensionUri,
			'Models',
			'Camera.glb'
		);

		const viewGizmoModelPath = vscode.Uri.joinPath(
			this.context.extensionUri,
			'Models',
			'ViewGizmo.glb'
		);

		const checkerTexturePath = vscode.Uri.joinPath(
			this.context.extensionUri,
			'images',
			'checkers.png'
		);
		const editorIconUri = name => webviewPanel.webview.asWebviewUri(
			vscode.Uri.joinPath(
				this.context.extensionUri,
				'images',
				'editor-icons',
				`${name}.svg`
			)
		).toString();

		const cameraModelUri =
			webviewPanel.webview.asWebviewUri(
				cameraModelPath
			);

		const viewGizmoModelUri =
			webviewPanel.webview.asWebviewUri(
				viewGizmoModelPath
			);

		const checkerTextureUri =
			webviewPanel.webview.asWebviewUri(
				checkerTexturePath
			);

		const styleUri =
			webviewPanel.webview.asWebviewUri(stylePath);

		const scriptUri =
			webviewPanel.webview.asWebviewUri(scriptPath);

		const threeUri =
			webviewPanel.webview.asWebviewUri(threePath);

		const threeAddonsUri =
			webviewPanel.webview.asWebviewUri(threeAddonsPath);

		const rapierUri =
			webviewPanel.webview.asWebviewUri(rapierPath);

		let html = fs.readFileSync(
			htmlPath.fsPath,
			'utf8'
		);

		html = html
			.replace(
				'{{STYLE_URI}}',
				styleUri.toString()
			)
			.replace(
				'{{SCRIPT_URI}}',
				scriptUri.toString()
			)
			.replace(
				'{{THREE_URI}}',
				threeUri.toString()
			)
			.replace(
				'{{THREE_ADDONS_URI}}',
				`${threeAddonsUri.toString()}/`
			)
			.replace(
				'{{RAPIER_URI}}',
				rapierUri.toString()
			)
			.replace(
				'{{CAMERA_MODEL_URI}}',
				cameraModelUri.toString()
			)
			.replace(
				'{{VIEW_GIZMO_MODEL_URI}}',
				viewGizmoModelUri.toString()
			)
			.replace(
				'{{CHECKER_TEXTURE_URI}}',
				checkerTextureUri.toString()
			)
			.replace(
				'{{MOVE_ICON_URI}}',
				editorIconUri('move')
			)
			.replace(
				'{{ROTATE_ICON_URI}}',
				editorIconUri('rotate')
			)
			.replace(
				'{{SCALE_ICON_URI}}',
				editorIconUri('scale')
			);

		webviewPanel.webview.html = html;

		webviewPanel.webview.onDidReceiveMessage(
			async message => {
				const action = ['onSceneUpdate', 'onOutlineUpdate']
					.includes(message.type)
					? message.action
					: message.type;

				switch (action) {
					case 'ready':
						await this.loadScene(
							document.uri,
							webviewPanel
						);
						break;

					case 'selectActor':
						await vscode.commands.executeCommand(
							'infinite.selectActor',
							message.actorId
						);
						break;

					case 'updateActorTransform':
						await this.updateActorTransform(
							document.uri,
							message
						);
						break;
					case 'saveEditorState':
						await this.saveEditorState(document.uri, message.state);
						break;
					case 'duplicateActorTransform':
						await this.duplicateActorAtTransform(
							document.uri,
							message
						);
						break;
					case 'assetDrop':
						this.assetDrag = null;
						await this.dropActorAsset(
							document.uri,
							message.item ?? this.getActiveAssetDrag(),
							message.position
						);
						break;
					case 'scriptPrint':
						if (Array.isArray(message.values)) {
							this.printHandler?.(...message.values);
						}
						break;
					case 'runtimeError':
						this.runtimeErrorHandler?.(message.error ?? {});
						break;
					case 'playStarted':
					case 'playStartFailed':
						this.finishPlayStart(message);
						break;
				}
			}
		);
	}

	async dropActorAsset(sceneUri, item, position) {
		if (
			item?.kind !== 'asset' ||
			item.type !== 'actor' ||
			typeof item.uri !== 'string' ||
			!Array.isArray(position) ||
			position.length !== 3 ||
			!position.every(Number.isFinite)
		) return;

		try {
			const assetUri = vscode.Uri.parse(item.uri);
			const workspace = vscode.workspace.getWorkspaceFolder(sceneUri);
			if (!workspace || vscode.workspace.getWorkspaceFolder(assetUri)?.uri.toString() !== workspace.uri.toString()) {
				throw new Error('Actor Asset must belong to the same project as the scene.');
			}

			const asset = JSON.parse(Buffer.from(
				await vscode.workspace.fs.readFile(assetUri)
			).toString('utf8'));
			if (asset.type !== 'actor' || typeof asset.id !== 'string') {
				throw new Error('Only Actor Assets can be dropped into a scene.');
			}

			const snapshot = await this.getSceneSnapshot(sceneUri);
			const manager = new IEAssetManager(workspace.uri.fsPath);
			await manager.scan();
			const actor = await snapshot.scene.instantiateActor(
				{ type: 'actor', id: asset.id }, manager, snapshot.scene.world.id
			);
			actor.position?.setValue?.(position);
			await this.commitSceneSnapshot(snapshot, { selectedActorId: actor.id });
		} catch (error) {
			vscode.window.showErrorMessage(
				`Failed to drop Actor Asset: ${error instanceof Error ? error.message : String(error)}`
			);
		}
	}

	async saveEditorState(sceneUri, state) {
		const finiteArray = (value, length) =>
			Array.isArray(value) && value.length === length && value.every(Number.isFinite);
		const validViews = new Set([
			'perspective', 'top', 'bottom', 'front', 'back', 'left', 'right'
		]);

		if (
			!state || typeof state !== 'object' ||
			!validViews.has(state.camera?.view) ||
			!finiteArray(state.camera?.position, 3) ||
			!finiteArray(state.camera?.quaternion, 4) ||
			!finiteArray(state.camera?.target, 3) ||
			!Number.isFinite(state.camera?.flySpeed)
		) return;

		return this.queueSceneEdit(sceneUri, () =>
			this.saveEditorStateNow(sceneUri, state)
		);
	}

	async saveEditorStateNow(sceneUri, state) {
		const key = this.editorStateKey(sceneUri);
		const value = structuredClone(state);
		this.editorStateMemory.set(key, value);
		await this.context?.workspaceState?.update(key, value);
	}

	editorStateKey(sceneUri) {
		return `infinite.sceneEditorState.${sceneUri.toString()}`;
	}

	async getEditorState(sceneUri, legacyState = undefined) {
		const key = this.editorStateKey(sceneUri);
		const stored = this.context?.workspaceState?.get(key) ??
			this.editorStateMemory.get(key);
		if (stored) return structuredClone(stored);

		if (legacyState) {
			await this.saveEditorStateNow(sceneUri, legacyState);
			return structuredClone(legacyState);
		}

		return undefined;
	}

	selectActor(
		sceneUri,
		actorId
	) {
		this.sceneSelections.set(sceneUri.toString(), {
			actorId,
			componentId: null
		});
		const panel = this.getPanel(sceneUri);

		if (!panel) return

		panel.webview.postMessage({
			type: 'selectActor',
			actorId
		});
	}

	selectComponent(sceneUri, actorId, componentId) {
		const key = sceneUri.toString();
		const selection = this.sceneSelections.get(key);
		if (selection?.actorId !== actorId) return false;
		this.sceneSelections.set(key, { actorId, componentId: componentId ?? null });
		return true;
	}

	getSelection(sceneUri) {
		const selection = this.sceneSelections.get(sceneUri.toString());
		return selection ? { ...selection } : null;
	}

	clearSelection(sceneUri) {
		this.sceneSelections.delete(sceneUri.toString());
		this.getPanel(sceneUri)?.webview.postMessage({
			type: 'selectActor',
			actorId: null
		});
	}

	assertSceneEditable(sceneUri) {
		const lifecycle = this.sceneLifecycles.get(sceneUri.toString());
		if (lifecycle && lifecycle !== 'editing') {
			throw new Error(`Scene editing is disabled while the scene is ${lifecycle}.`);
		}
	}

	async updateProperty(sceneUri, data) {
		if (!['actor', 'component'].includes(data?.target)) return;
		if (typeof data.id !== 'string' || typeof data.property !== 'string') return;
		return this.queueSceneEdit(sceneUri, () =>
			this.updatePropertyNow(sceneUri, data)
		);
	}

	async updatePropertyNow(sceneUri, data) {
		this.assertSceneEditable(sceneUri);
		const document = await vscode.workspace.openTextDocument(sceneUri);
		const originalText = document.getText();
		const scene = IEScene.fromJSON(JSON.parse(originalText));
		const workspace = vscode.workspace.getWorkspaceFolder(sceneUri);

		if (!workspace) {
			throw new Error('Scene is not inside a VS Code workspace');
		}

		const assetManager = new IEAssetManager(workspace.uri.fsPath);
		await assetManager.scan();

		let actor;
		let editableActor;
		let component;

		if (data.target === 'actor') {
			actor = scene.getActor(data.id);
			if (!actor) return;

			editableActor = actor;

			if (actor.isInstance()) {
				const resolved = await IEActorInstance.resolve(actor.toJSON(), assetManager);
				editableActor = ActorRegistry.fromJSON(resolved);
			}
		} else {
			for (const candidate of scene.getActors()) {
				let resolvedCandidate = candidate;

				if (candidate.isInstance()) {
					const resolved = await IEActorInstance.resolve(
						candidate.toJSON(),
						assetManager
					);
					resolvedCandidate = ActorRegistry.fromJSON(resolved);
				}

				const match = resolvedCandidate.getComponentById(data.id);
				if (!match) continue;

				actor = candidate;
				editableActor = resolvedCandidate;
				component = match;
				break;
			}

			if (!actor || !component) return;
		}

		if (data.target === 'actor') {
			if (actor.isInstance() && ['position', 'rotation', 'scale'].includes(data.property)) {
				const value = editableActor.setProperty(data.property, data.value);
				actor.overrides ??= {};
				actor.overrides.transform ??= {};
				actor.overrides.transform[data.property] = structuredClone(value);
			} else {
				actor.setProperty(data.property, data.value);
			}
		} else {
			const nextValue = component.setProperty(data.property, data.value);

			if (actor.isInstance()) {
				actor.overrides ??= {};
				actor.overrides.components ??= {};
				actor.overrides.components[data.id] ??= {};
				actor.overrides.components[data.id][data.property] =
					structuredClone(nextValue);
			}
		}

		const updatedText = `${JSON.stringify(scene.toJSON(), null, 4)}\n`;

		if (document.getText() !== originalText) {
			throw new Error('The scene changed while updating the property');
		}

		const edit = new vscode.WorkspaceEdit();
		edit.replace(
			sceneUri,
			new vscode.Range(
				document.positionAt(0),
				document.positionAt(originalText.length)
			),
			updatedText
		);

		if (!await vscode.workspace.applyEdit(edit)) {
			throw new Error('Unable to update the scene document');
		}

		if (vscode.workspace.getConfiguration('infinite').get('autoSave', true)) {
			await document.save();
		}

		const resolvedScene = await this.resolveSceneAssets(
			sceneUri,
			scene.toJSON()
		);
		const serializedActor = resolvedScene.actors.find(item => item.id === actor.id);

		await this.getPanel(sceneUri)?.webview.postMessage({
			type: 'onUpdateProperty',
			data: {
				target: data.target,
				id: data.id,
				property: data.property,
				actor: serializedActor
			}
		});

		return {
			actor: actor.isInstance()
				? ActorRegistry.fromJSON(serializedActor)
				: actor
		};
	}



	async updateActorTransform(sceneUri, message) {
		return this.queueSceneEdit(sceneUri, () =>
			this.updateActorTransformNow(sceneUri, message)
		);
	}

	async updateActorTransformNow(sceneUri, message) {
		try {
			this.assertSceneEditable(sceneUri);
			const document = await vscode.workspace.openTextDocument(sceneUri);
			const originalText = document.getText();
			const scene = IEScene.fromJSON(JSON.parse(originalText));

			const actor = scene.getActor(message.actorId);
			if (!actor || actor.type === 'World') return;

			const properties = ['position', 'rotation', 'scale'];

			for (const property of properties) {
				const value = message[property];

				if (
					!Array.isArray(value) ||
					value.length !== 3 ||
					!value.every(Number.isFinite)
				) {
					throw new Error(`Invalid actor ${property}`);
				}
			}

			if (actor.isInstance()) {
				actor.overrides ??= {};

				actor.overrides.transform = {
					...actor.overrides.transform,
					position: [...message.position],
					rotation: [...message.rotation],
					scale: [...message.scale]
				};
			} else {
				if (
					!actor.position?.setValue ||
					!actor.rotation?.setValue ||
					!actor.scale?.setValue
				) {
					throw new Error(
						`Actor "${actor.name}" does not support transforms`
					);
				}

				actor.position.setValue(message.position);
				actor.rotation.setValue(message.rotation);
				actor.scale.setValue(message.scale);
			}

			const updatedText = `${JSON.stringify(scene.toJSON(), null, 4)}\n`;
			if (updatedText === originalText) return;

			const edit = new vscode.WorkspaceEdit();
			edit.replace(
				sceneUri,
				new vscode.Range(
					document.positionAt(0),
					document.positionAt(originalText.length)
				),
				updatedText
			);

			if (!await vscode.workspace.applyEdit(edit)) {
				throw new Error('Unable to update the scene document');
			}

			if (vscode.workspace.getConfiguration('infinite').get('autoSave', true)) {
				await document.save();
			}

			this.selectActor(sceneUri, message.actorId);
			await this.sceneChangeHandler?.({
				sceneUri,
				scene,
				selectedActorId: message.actorId
			});
		} catch (error) {
			console.error('Failed to update actor transform:', error);

			vscode.window.showErrorMessage(
				`Failed to save actor transform: ${error instanceof Error ? error.message : String(error)
				}`
			);
		}
	}

	async getSceneSnapshot(sceneUri) {
		this.assertSceneEditable(sceneUri);
		const document = await vscode.workspace.openTextDocument(sceneUri);
		const originalText = document.getText();

		return {
			document,
			originalText,
			scene: IEScene.fromJSON(JSON.parse(originalText))
		};
	}

	async commitSceneSnapshot(snapshot, options = {}) {
		return this.queueSceneEdit(snapshot.document.uri, () =>
			this.commitSceneSnapshotNow(snapshot, options)
		);
	}

	async commitSceneSnapshotNow(snapshot, options = {}) {
		const { document, scene } = snapshot;
		let { originalText } = snapshot;
		const sceneUri = document.uri;
		this.assertSceneEditable(sceneUri);
		const currentText = document.getText();

		if (currentText !== originalText) {
			const originalData = JSON.parse(originalText);
			const currentData = JSON.parse(currentText);
			const currentEditorState = currentData.editorState;
			delete originalData.editorState;
			delete currentData.editorState;

			if (JSON.stringify(currentData) !== JSON.stringify(originalData)) {
				throw new Error('The scene changed while applying the edit');
			}

			// Camera and viewport state is saved asynchronously. It is safe to
			// rebase a structural edit over that metadata-only change.
			scene.editorState = currentEditorState
				? structuredClone(currentEditorState)
				: undefined;
			originalText = currentText;
		}

		const updatedText = `${JSON.stringify(scene.toJSON(), null, 4)}\n`;
		if (updatedText === originalText) return false;

		const edit = new vscode.WorkspaceEdit();
		edit.replace(
			sceneUri,
			new vscode.Range(
				document.positionAt(0),
				document.positionAt(originalText.length)
			),
			updatedText
		);

		if (!await vscode.workspace.applyEdit(edit)) {
			throw new Error('Unable to update the scene document');
		}

		if (vscode.workspace.getConfiguration('infinite').get('autoSave', true)) {
			await document.save();
		}

		await this.refreshScene(sceneUri);

		const selectedActorId = options.selectedActorId ?? null;
		if (selectedActorId && scene.getActor(selectedActorId)) {
			this.selectActor(sceneUri, selectedActorId);
		} else {
			this.clearSelection(sceneUri);
		}

		await this.sceneChangeHandler?.({
			sceneUri,
			scene,
			selection: this.getSelection(sceneUri),
			selectedActorId
		});

		return true;
	}

	async duplicateActorAtTransform(sceneUri, message) {
		try {
			const snapshot = await this.getSceneSnapshot(sceneUri);
			const { scene } = snapshot;
			const source = scene.getActor(message.actorId);
			if (!source || source.type === 'World') return;

			for (const property of ['position', 'rotation', 'scale']) {
				if (!Array.isArray(message[property]) ||
					message[property].length !== 3 ||
					!message[property].every(Number.isFinite)) {
					throw new Error(`Invalid duplicate actor ${property}`);
				}
			}

			const data = structuredClone(source.toJSON());
			data.id = crypto.randomUUID();
			data.name = `${source.name} Copy`;

			if (Array.isArray(data.components)) {
				const ids = new Map(data.components.map(component => [
					component.id,
					crypto.randomUUID()
				]));
				for (const component of data.components) {
					component.id = ids.get(component.id);
					if (ids.has(component.parent)) component.parent = ids.get(component.parent);
				}
			}

			const duplicate = ActorRegistry.fromJSON(data);
			if (duplicate.isInstance()) {
				duplicate.overrides ??= {};
				duplicate.overrides.transform = {
					position: [...message.position],
					rotation: [...message.rotation],
					scale: [...message.scale]
				};
			} else {
				for (const property of ['position', 'rotation', 'scale']) {
					duplicate[property]?.setValue?.(message[property]);
				}
			}

			scene.addActor(duplicate);
			await this.commitSceneSnapshot(snapshot, {
				selectedActorId: duplicate.id
			});
		} catch (error) {
			console.error('Failed to duplicate actor:', error);
			vscode.window.showErrorMessage(
				`Failed to duplicate actor: ${error instanceof Error ? error.message : String(error)}`
			);
		}
	}





	async resolveSceneAssets(sceneUri, sceneData) {
		const workspace = vscode.workspace.getWorkspaceFolder(sceneUri);

		if (!workspace) {
			throw new Error('Scene is not inside a VS Code workspace');
		}

		const assetManager = new IEAssetManager(workspace.uri.fsPath);
		await assetManager.scan();

		const actors = [];

		for (const instance of sceneData.actors ?? []) {
			const actor = await IEActorInstance.resolve(
				instance,
				assetManager
			);

			for (const component of actor.components ?? []) {
				if (component.type === 'terrain') {
					const asset = await assetManager.resolve(component.terrain);
					if (asset?.type === 'terrain') {
						try {
							const graph = asset.data ?? asset.graph;
							const textures = await resolveTerrainTextures(
								graph,
								assetManager
							);
							const materials = await resolveTerrainMaterials(
								graph,
								assetManager
							);
							component.resolvedTerrain = new IETerrainGraphEvaluator(undefined, { maxResolution: 512, textures, materials }).evaluate(graph).terrain;
							component.terrainRevision = crypto.createHash('sha1').update(JSON.stringify(asset.data ?? asset.graph)).digest('hex');
						} catch (error) {
							component.terrainError = error.message;
						}
					}
				}
				if (component.type === 'script') {
					const asset = await assetManager.resolve(component.script);

					component.resolvedScript =
						asset?.type === 'script' ? asset.data : null;
				}

				if (component.type === 'mesh') {
					const geometry = await assetManager.resolve(
						component.geometry
					);

					if (component.geometry && !geometry) {
						console.warn(
							'Geometry asset not found:',
							component.geometry
						);
					}

					component.resolvedGeometry =
						geometry?.type === 'geometry'
							? geometry.data
							: null;

					component.resolvedMaterials = await Promise.all(
						(component.materials ?? []).map(reference =>
							assetManager.resolveMaterialForScene(reference)
						)
					);


					if (component.skinned) {
						const skeleton = await assetManager.resolve(
							component.skeleton
						);

						if (!skeleton || skeleton.type !== 'skeleton') {
							throw new Error(
								`Skeleton not found: ${component.name}`
							);
						}

						component.resolvedSkeleton = skeleton.data;
					}

				}
			}

			actors.push(actor);
		}


		// Load all geometry and material assets, including
		// assets that aren't currently assigned to a component.
		const runtimeAssets = [];

		const geometries = assetManager.getAssets('geometry');
		const materials = assetManager.getAssets('material');

		for (const entry of geometries) {
			const asset = await assetManager.resolve({
				type: 'geometry',
				id: entry.id
			});

			if (!asset || asset.type !== 'geometry') {
				console.warn(
					'[IE] Could not resolve geometry:',
					entry.id
				);
				continue;
			}

			runtimeAssets.push({
				id: asset.id,
				type: 'geometry',
				data: asset.data
			});
		}

		for (const entry of materials) {
			const data =
				await assetManager.resolveMaterialForScene({
					type: 'material',
					id: entry.id
				});

			if (!data) {
				console.warn(
					'[IE] Could not resolve material:',
					entry.id
				);
				continue;
			}

			runtimeAssets.push({
				id: entry.id,
				type: 'material',
				data
			});
		}


		const skeletons = assetManager.getAssets('skeleton');
		const animations = assetManager.getAssets('animation');
		const animationStates = assetManager.getAssets('animationState');

		for (const entry of skeletons) {
			const asset = await assetManager.resolve({
				type: 'skeleton',
				id: entry.id
			});

			if (!asset) {
				console.warn(
					'[IE] Could not resolve skeleton:',
					entry.id
				);
				continue;
			}

			runtimeAssets.push({
				id: asset.id,
				type: 'skeleton',
				data: asset.data
			});
		}

		for (const entry of animations) {
			const asset = await assetManager.resolve({
				type: 'animation',
				id: entry.id
			});

			if (!asset) {
				console.warn(
					'[IE] Could not resolve animation:',
					entry.id
				);
				continue;
			}

			runtimeAssets.push({
				id: asset.id,
				type: 'animation',
				data: asset.data
			});
		}


		/* =========================================================
		   ANIMATION SCRIPT ASSETS
		   ========================================================= */

		for (const entry of animationStates) {
			const asset = await assetManager.resolve({
				type: 'animationState',
				id: entry.id
			});

			if (!asset) {
				console.warn(
					'[IE] Could not resolve Animation Script:',
					entry.id
				);

				continue;
			}

			runtimeAssets.push({
				id: asset.id,
				name: asset.name,
				type: 'animationState',
				data: asset.data
			});
		}

		return {
			...sceneData,
			actors,
			runtimeAssets
		};

	}




	setPrintHandler(handler) {
		this.printHandler = handler;
	}

	setRuntimeErrorHandler(handler) {
		this.runtimeErrorHandler = handler;
	}

	setPanelDisposeHandler(handler) {
		this.panelDisposeHandler = handler;
	}

	setSceneChangeHandler(handler) {
		this.sceneChangeHandler = handler;
	}

	async syncSceneAfterHistoryChange(sceneUri) {
		await this.waitForSceneEdits(sceneUri);
		const document = await vscode.workspace.openTextDocument(sceneUri);
		const scene = IEScene.fromJSON(JSON.parse(document.getText()));
		await this.refreshScene(sceneUri);

		const selection = this.getSelection(sceneUri);
		const selectedActor = selection?.actorId
			? scene.getActor(selection.actorId)
			: null;
		if (selectedActor) {
			if (
				selection.componentId &&
				!selectedActor.isInstance() &&
				!selectedActor.getComponentById(selection.componentId)
			) selection.componentId = null;
			this.sceneSelections.set(sceneUri.toString(), selection);
			this.getPanel(sceneUri)?.webview.postMessage({
				type: 'selectActor',
				actorId: selection.actorId
			});
		} else {
			this.clearSelection(sceneUri);
		}

		await this.sceneChangeHandler?.({
			sceneUri,
			scene,
			selection: this.getSelection(sceneUri),
			selectedActorId: this.getSelection(sceneUri)?.actorId ?? null
		});
	}

	async loadScene(sceneUri, webviewPanel) {
		const key = sceneUri.toString();
		const version = (this.sceneLoadVersions.get(key) ?? 0) + 1;
		this.sceneLoadVersions.set(key, version);
		try {
			const scene = new IEScene(sceneUri);
			await scene.load();
			const editorState = await this.getEditorState(
				sceneUri,
				scene.editorState
			);

			const sceneData = await this.resolveSceneAssets(
				sceneUri,
				scene.toJSON()
			);
			sceneData.editorState = editorState;

			const workspace = vscode.workspace.getWorkspaceFolder(sceneUri);
			const customNodeModules = [];
			if (workspace && vscode.workspace.isTrusted) {
				for (const uri of await findCustomNodeFiles(workspace)) {
					const stat = await vscode.workspace.fs.stat(uri);
					customNodeModules.push(
						webviewPanel.webview.asWebviewUri(uri).with({
							query: `v=${stat.mtime}`
						}).toString()
					);
				}
			}

			if (
				this.panels.get(key) !== webviewPanel ||
				this.sceneLoadVersions.get(key) !== version
			) return false;

			return await webviewPanel.webview.postMessage({
				type: 'loadScene',
				scene: sceneData,
				customNodeModules
			});
		} catch (error) {
			const message = error instanceof Error
				? error.message
				: String(error);

			console.error('Failed to load Infinite scene:', error);
			vscode.window.showErrorMessage(
				`Failed to load scene: ${message}`
			);
		}
	}


	async refreshScene(sceneUri) {
		const key = sceneUri.toString();
		if (this.sceneLifecycles.get(key) !== 'editing') {
			this.pendingPlayRefreshes.add(key);
			return;
		}
		const panel = this.getPanel(
			sceneUri
		);

		if (!panel) {
			return;
		}

		await this.loadScene(
			sceneUri,
			panel
		);
	}




	async beginPlay(sceneUri, sceneData) {
		const key = sceneUri.toString();
		const panel = this.getPanel(sceneUri);
		if (!panel) {
			throw new Error('Open the scene editor before entering play mode.');
		}
		if (this.sceneLifecycles.get(key) !== 'editing') {
			throw new Error(`Scene cannot start from ${this.sceneLifecycles.get(key)} state.`);
		}

		this.sceneLifecycles.set(key, 'starting');
		this.sceneLoadVersions.set(key, (this.sceneLoadVersions.get(key) ?? 0) + 1);

		try {
			const runtimeSnapshot = structuredClone(sceneData);
			IEScene.fromJSON(runtimeSnapshot);
			const resolvedScene = await this.resolveSceneAssets(
				sceneUri,
				runtimeSnapshot
			);
			if (
				this.getPanel(sceneUri) !== panel ||
				this.sceneLifecycles.get(key) !== 'starting'
			) throw new Error('Scene editor closed while play mode was starting.');

			const requestId = crypto.randomUUID();
			const confirmation = new Promise((resolve, reject) => {
				const timer = setTimeout(() => {
					this.playStartRequests.delete(requestId);
					reject(new Error('Scene viewport timed out while starting play mode.'));
				}, 10000);
				this.playStartRequests.set(requestId, {
					sceneKey: key,
					resolve,
					reject,
					timer
				});
			});
			const delivered = await panel.webview.postMessage({
				type: 'beginPlay',
				scene: structuredClone(resolvedScene),
				requestId
			});
			if (!delivered) {
				const request = this.playStartRequests.get(requestId);
				clearTimeout(request?.timer);
				this.playStartRequests.delete(requestId);
				throw new Error('The scene viewport did not accept play mode.');
			}
			await confirmation;
			this.sceneLifecycles.set(key, 'playing');
		} catch (error) {
			if (this.sceneLifecycles.get(key) === 'starting') {
				this.sceneLifecycles.set(key, 'editing');
			}
			throw error;
		}
	}

	finishPlayStart(message) {
		const request = this.playStartRequests.get(message.requestId);
		if (!request) return;
		clearTimeout(request.timer);
		this.playStartRequests.delete(message.requestId);
		if (message.type === 'playStarted') {
			request.resolve();
		} else {
			request.reject(new Error(message.message || 'Scene viewport failed to start.'));
		}
	}


	async pausePlay(sceneUri) {
		const key = sceneUri.toString();
		if (this.sceneLifecycles.get(key) !== 'playing') return;
		const panel = this.getPanel(
			sceneUri
		);

		if (!panel) {
			return;
		}

		if (await panel.webview.postMessage({
			type: 'pausePlay'
		})) this.sceneLifecycles.set(key, 'paused');
	}

	async continuePlay(sceneUri) {
		const key = sceneUri.toString();
		if (this.sceneLifecycles.get(key) !== 'paused') return;
		const panel = this.getPanel(
			sceneUri
		);

		if (!panel) {
			return;
		}

		if (await panel.webview.postMessage({
			type: 'continuePlay'
		})) this.sceneLifecycles.set(key, 'playing');
	}

	async stopPlay(sceneUri) {
		const key = sceneUri.toString();
		if (!['starting', 'playing', 'paused'].includes(
			this.sceneLifecycles.get(key)
		)) return;
		this.sceneLifecycles.set(key, 'stopping');
		const panel = this.getPanel(
			sceneUri
		);

		if (!panel) {
			this.sceneLifecycles.delete(key);
			return;
		}

		await panel.webview.postMessage({
			type: 'stopPlay'
		});
		this.sceneLifecycles.set(key, 'editing');
		if (this.pendingPlayRefreshes.delete(key)) {
			await this.loadScene(sceneUri, panel);
		}
	}

	getPanel(sceneUri) {
		return this.panels.get(
			sceneUri.toString()
		);
	}
}

module.exports = IESceneEditor;
