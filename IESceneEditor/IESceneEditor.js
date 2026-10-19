// @ts-nocheck
const vscode = require('vscode');
const fs = require('fs');
const IEScene = require('../IEScene');
const IEActorInstance = require('../IEActorInstance');
const IEAssetManager = require('../IEAssetManager');
const ActorRegistry = require('../ActorRegistry');
const registerActors = require('../Actors/registerActors');
const IETerrainGraphEvaluator = require('../IEWorldEditor/IETerrainGraphEvaluator');
const { resolveTerrainTextures } = require('../IEWorldEditor/IETextureDataDecoder');
const crypto = require('crypto');

registerActors();

class IESceneEditor {

	constructor(context) {
		this.context = context;

		this.panels = new Map();
	}

	async resolveCustomTextEditor(document, webviewPanel) {
		const sceneKey = document.uri.toString();

		this.panels.set(
			sceneKey,
			webviewPanel
		);

		await this.context.workspaceState.update(
			'activeSceneUri',
			sceneKey
		);

		webviewPanel.onDidDispose(() => {
			this.panels.delete(sceneKey);
		});

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

		const cameraModelUri =
			webviewPanel.webview.asWebviewUri(
				cameraModelPath
			);

		const viewGizmoModelUri =
			webviewPanel.webview.asWebviewUri(
				viewGizmoModelPath
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
					case 'scriptPrint':
						if (Array.isArray(message.values)) {
							this.printHandler?.(...message.values);
						}
						break;
				}
			}
		);
	}

	selectActor(
		sceneUri,
		actorId
	) {
		const panel = this.getPanel(sceneUri);

		if (!panel) return

		panel.webview.postMessage({
			type: 'selectActor',
			actorId
		});
	}

	async updateProperty(sceneUri, data) {
		if (!['actor', 'component'].includes(data?.target)) return;
		if (typeof data.id !== 'string' || typeof data.property !== 'string') return;

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
		try {
			const scene = new IEScene(sceneUri);
			await scene.load();

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

			await scene.save();

			await vscode.commands.executeCommand(
				'infinite.selectActor',
				message.actorId
			);
		} catch (error) {
			console.error('Failed to update actor transform:', error);

			vscode.window.showErrorMessage(
				`Failed to save actor transform: ${error instanceof Error ? error.message : String(error)
				}`
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
							component.resolvedTerrain = new IETerrainGraphEvaluator(undefined, { maxResolution: 512, textures }).evaluate(graph).terrain;
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

	async loadScene(sceneUri, webviewPanel) {
		try {
			const scene = new IEScene(sceneUri);
			await scene.load();

			const sceneData = await this.resolveSceneAssets(
				sceneUri,
				scene.toJSON()
			);

			await webviewPanel.webview.postMessage({
				type: 'loadScene',
				scene: sceneData
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
		console.log("Scene refresh")
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
		const panel = this.getPanel(sceneUri);
		if (!panel) return;

		try {
			const resolvedScene = await this.resolveSceneAssets(
				sceneUri,
				structuredClone(sceneData)
			);

			await panel.webview.postMessage({
				type: 'beginPlay',
				scene: resolvedScene
			});
		} catch (error) {
			console.error('Failed to begin play:', error);
		}
	}


	async pausePlay(sceneUri) {
		const panel = this.getPanel(
			sceneUri
		);

		if (!panel) {
			return;
		}

		await panel.webview.postMessage({
			type: 'pausePlay'
		});
	}

	async continuePlay(sceneUri) {
		const panel = this.getPanel(
			sceneUri
		);

		if (!panel) {
			return;
		}

		await panel.webview.postMessage({
			type: 'continuePlay'
		});
	}

	async stopPlay(sceneUri) {
		const panel = this.getPanel(
			sceneUri
		);

		if (!panel) {
			return;
		}

		await panel.webview.postMessage({
			type: 'stopPlay'
		});
	}

	getPanel(sceneUri) {
		return this.panels.get(
			sceneUri.toString()
		);
	}
}

module.exports = IESceneEditor;
