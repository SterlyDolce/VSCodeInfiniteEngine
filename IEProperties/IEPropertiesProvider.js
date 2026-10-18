// @ts-nocheck
const vscode = require('vscode');
const fs = require('fs');
const IEScene = require('../IEScene');
const IEType = require('../Types/IEType');
const IEAssetManager = require('../IEAssetManager');
const crypto = require('crypto');
const IETypeRegistry = require('../Types/IETypeRegistry');
const ComponentRegistry = require('../ComponentRegistry');

class IEPropertiesProvider {
	constructor(
		context,
		sceneEditor
	) {
		this.context = context;
		this.sceneEditor = sceneEditor;
		this.activeEditor = null;
		this.editorChangeId = 0;
		this.actorAssetSelection = null;

		this.view = undefined;
		this.actor = undefined;
		this.graphSelection = null;
		this.animationStateSelection = null;
		this.skeletonSelection = null;
	}

	resolveWebviewView(
		webviewView
	) {
		this.view =
			webviewView;

		const webview =
			webviewView.webview;

		const folder =
			vscode.Uri.joinPath(
				this.context.extensionUri,
				'IEProperties'
			);

		const threeFolder =
			vscode.Uri.joinPath(
				this.context.extensionUri,
				'node_modules',
				'three'
			);

		webview.options = {
			enableScripts: true,

			localResourceRoots: [
				folder,
				threeFolder
			]
		};

		const htmlPath = vscode.Uri.joinPath(
			folder,
			'index.html'
		);

		const styleUri = webview.asWebviewUri(
			vscode.Uri.joinPath(
				folder,
				'style.css'
			)
		);

		const scriptUri = webview.asWebviewUri(
			vscode.Uri.joinPath(
				folder,
				'script.mjs'
			)
		);

		const threeUri = webview.asWebviewUri(
			vscode.Uri.joinPath(
				this.context.extensionUri,
				'node_modules',
				'three',
				'build',
				'three.module.js'
			)
		);


		const nonce = crypto.randomBytes(16).toString('base64');

		let html = fs.readFileSync(
			htmlPath.fsPath,
			'utf8'
		);


		html = html
			.replaceAll('{{CSP_SOURCE}}', webview.cspSource)
			.replaceAll('{{NONCE}}', nonce)
			.replaceAll('{{STYLE_URI}}', styleUri.toString())
			.replaceAll('{{SCRIPT_URI}}', scriptUri.toString())
			.replaceAll('{{THREE_URI}}', threeUri.toString());

		webview.html = html;

		webview.onDidReceiveMessage(
			async message => {
				const action = [
					'onPropertyUpdate',
					'onOutlineUpdate',
					'onAssetsUpdate'
				].includes(message.type)
					? message.action ?? message.type
					: message.type;

				switch (action) {
					case 'onPropertyUpdate':
						await this.handlePropertyUpdate(message.data);
						break;

					case 'selectAssetComponent':
						await this.selectActorAssetComponent(
							message.componentId
						);
						break;

					case 'resolveComponentAssets':
						await this.resolveComponentAssets(
							message.actorId,
							message.componentId
						);
						break;

					case 'webviewReady':
						await webview.postMessage({
							type: 'dataTypes',
							types: IETypeRegistry.getDefinitions()
						});

						await this.update();
						break;

				}
			}
		);

		this.update();
	}


	setActorAssetSelection(uri, actor, componentId, handlers) {
		this.actorAssetSelection = {
			uri,
			actor,
			componentId,
			handlers
		};

		void this.update();
	}

	clearActorAssetSelection(uri) {
		if (this.actorAssetSelection?.uri !== uri) return;

		this.actorAssetSelection = null;
		void this.update();
	}

	async updateActorAssetProperty(componentId, property, value) {
		const selection = this.actorAssetSelection;

		if (
			!selection ||
			this.activeEditor?.assetType !== 'actor' ||
			this.activeEditor.uri !== selection.uri
		) return;

		await selection.handlers.updateProperty(
			componentId,
			property,
			value
		);
	}

	async selectActorAssetComponent(componentId) {
		const selection = this.actorAssetSelection;

		if (
			!selection ||
			this.activeEditor?.assetType !== 'actor' ||
			this.activeEditor.uri !== selection.uri
		) return;

		await selection.handlers.selectComponent(componentId);
	}



	async updateFunctionParameter(message) {
		const editor = this.activeEditor;

		if (
			editor?.type !== 'asset' ||
			editor.assetType !== 'script' ||
			!['inputs', 'outputs'].includes(message.direction) ||
			!['add', 'update', 'delete'].includes(message.operation)
		) return;

		const selection = this.graphSelection?.selection;

		if (
			selection?.type !== 'function' ||
			selection.id !== message.functionId
		) return;

		const IEVisualScriptEditor =
			require('../IEVisualScriptEditor/IEVisualScriptEditor');

		const panel = IEVisualScriptEditor.panels?.get(editor.uri);
		if (!panel) return;

		await panel.webview.postMessage({
			type: 'updateFunctionParameter',
			functionId: message.functionId,
			direction: message.direction,
			operation: message.operation,
			parameterId: message.parameterId,
			changes: message.changes ?? {}
		});
	}



	async updateGraphProperty(message) {
		const editor = this.activeEditor;

		if (
			editor?.type !== 'asset' ||
			!['script', 'material'].includes(editor.assetType)
		) return;

		const selection = this.graphSelection?.selection;

		if (
			!selection ||
			selection.id !== message.id ||
			selection.type !== message.selectionType ||
			(selection.functionId ?? null) !==
			(message.functionId ?? null)
		) return;

		const panel = this.getGraphPanel(editor.uri);

		if (!panel) {
			vscode.window.showWarningMessage(
				'The Visual Script Editor is not available.'
			);
			return;
		}

		await panel.webview.postMessage({
			type: 'updateGraphProperty',
			...message
		});
	}


	getGraphPanel(uri) {
		const editor = this.activeEditor;

		if (editor?.assetType === 'material') {
			const IEMaterialEditor = require(
				'../IEMaterialEditor/IEMaterialEditor'
			);

			return IEMaterialEditor.panels?.get(uri) ?? null;
		}

		const IEVisualScriptEditor = require(
			'../IEVisualScriptEditor/IEVisualScriptEditor'
		);

		return IEVisualScriptEditor.panels?.get(uri) ?? null;
	}





	setGraphSelection(data) {
		const editor = this.activeEditor;

		if (
			editor?.type !== 'asset' ||
			!['script', 'material'].includes(editor.assetType) ||
			editor.uri !== data.uri
		) {
			console.log('[IEProperties] Graph selection rejected', {
				editor,
				uri: data.uri
			});
			return;
		}

		this.graphSelection = data;
		void this.update();
	}


	clearGraphSelection(uri) {
		if (this.graphSelection?.uri !== uri) return;

		this.graphSelection = null;
		this.update();
	}



	async syncActiveEditor() {
		const changeId = ++this.editorChangeId;
		const tab = vscode.window.tabGroups.activeTabGroup.activeTab;
		const input = tab?.input;
		const uri = input?.uri;

		let editor = null;

		if (uri) {
			const extension = uri.path.toLowerCase().split('.').pop();

			if (extension === 'iescene') {
				editor = {
					type: 'scene',
					uri: uri.toString()
				};
			} else if (extension === 'ieasset') {
				try {
					const document = await vscode.workspace.openTextDocument(uri);
					const asset = JSON.parse(document.getText());

					editor = {
						type: 'asset',
						assetType: asset.type,
						assetId: asset.id,
						uri: uri.toString()
					};
				} catch {
					editor = {
						type: 'asset',
						assetType: 'unknown',
						uri: uri.toString()
					};
				}
			}
		}

		if (changeId !== this.editorChangeId) return;

		this.activeEditor = editor;

		if (
			this.animationStateSelection &&
			(
				editor?.assetType !== 'animationState' ||
				editor.uri !== this.animationStateSelection.uri
			)
		) {
			this.animationStateSelection = null;
		}

		if (
			this.graphSelection &&
			this.graphSelection.uri !== editor?.uri
		) {
			this.graphSelection = null;
		}

		if (
			this.skeletonSelection &&
			(
				editor?.assetType !== 'skeleton' ||
				editor.uri !== this.skeletonSelection.uri
			)
		) {
			this.skeletonSelection = null;
		}

		await this.update();
	}

	async handlePropertyUpdate(data) {
		const editor = this.activeEditor;
		if (!editor || !data) return;

		const result = await vscode.commands.executeCommand(
			'infinite.onPropertyUpdate',
			{ data, editor }
		);

		if (result?.actor) {
			this.actor = result.actor;
			await this.update();
		}
	}


	setAnimationStateSelection(selection) {
		console.log('[IE Properties] Incoming selection:', {
			activeEditor: this.activeEditor,
			uri: selection.uri,
			kind: selection.kind,
			id: selection.id
		});
		if (
			this.activeEditor?.assetType !== 'animationState' ||
			this.activeEditor.uri !== selection.uri
		) return;

		this.animationStateSelection = selection;
		void this.update();
	}

	setSkeletonSelection(selection) {
		if (
			this.activeEditor?.assetType !== 'skeleton' ||
			this.activeEditor.uri !== selection.uri
		) return;

		this.skeletonSelection = selection;
		void this.update();
	}

	clearSkeletonSelection(uri) {
		if (this.skeletonSelection?.uri !== uri) return;
		this.skeletonSelection = null;
		void this.update();
	}

	async updateSkeletonProperty(message) {
		const selection = this.skeletonSelection;
		if (
			!selection ||
			this.activeEditor?.assetType !== 'skeleton' ||
			selection.uri !== this.activeEditor.uri ||
			selection.nodeId !== message.id
		) return;

		const IESkeletonEditor = require(
			'../IESkeletonEditor/IESkeletonEditor'
		);
		const editor = IESkeletonEditor.editors.get(selection.uri);
		await editor?.updateProperty(
			selection.nodeId,
			message.property,
			message.value
		);
	}

	async updateAnimationStateProperty(message) {

		const selection = this.animationStateSelection;
		const editor = this.activeEditor;

		if (
			!selection ||
			editor?.assetType !== 'animationState' ||
			editor.uri !== selection.uri
		) return;

		if (selection.kind === 'animationNode') {
			const canvas = this.animationStateCanvas;

			if (canvas?.uri !== selection.uri) return;

			const isBlend = [
				'blend',
				'blend1d',
				'blend2d'
			].includes(selection.value?.kind);

			if (isBlend && message.blendProperty) {
				await canvas.panel.webview.postMessage({
					type: 'updateBlendSpaceProperty',
					layerId: selection.layerId,
					nodeId: selection.id,
					property: message.blendProperty,
					axis: message.axis,
					sampleId: message.sampleId,
					value: message.value
				});

				return;
			}

			await canvas.panel.webview.postMessage({
				type: 'updateStateNodeProperty',
				layerId: selection.layerId,
				nodeId: selection.id,
				property: message.property,
				value: message.value
			});

			return;
		}

		if (selection.kind === 'animationTransition') {
			const canvas = this.animationStateCanvas;
			if (canvas?.uri !== selection.uri) return;

			await canvas.panel.webview.postMessage({
				type: 'updateTransitionProperty',
				layerId: selection.layerId,
				transitionId: selection.id,
				property: message.property,
				value: message.value,
				operation: message.operation,
				conditionId: message.conditionId
			});
			return;
		}

		// Keep every Animation State edit in the canvas' in-memory graph.
		// Writing layer/parameter properties directly to the document races
		// with unsaved node edits and lets the next graph save overwrite them.
		const canvas = this.animationStateCanvas;

		if (
			canvas?.uri === selection.uri &&
			['animationLayer', 'animationParameter'].includes(selection.kind)
		) {
			await canvas.panel.webview.postMessage({
				type: 'updateAnimationStateItemProperty',
				kind: selection.kind,
				itemId: selection.id,
				property: message.property,
				value: message.value
			});

			if (message.property === 'name') {
				this.animationStateSelection = {
					...selection,
					id: String(message.value).trim()
				};
			}

			return;
		}

		const uri = vscode.Uri.parse(selection.uri);
		const document = await vscode.workspace.openTextDocument(uri);


		try {
			const asset = JSON.parse(document.getText());

			if (asset.type !== 'animationState') return;

			const { kind, id } = selection;
			const { property, value } = message;

			const item = kind === 'animationLayer'
				? asset.data.layers?.find(layer => layer.id === id)
				: asset.data.parameters?.find(param => param.name === id);

			if (!item) return;

			if (kind === 'animationLayer') {
				switch (property) {
					case 'name': {
						const name = String(value).trim();

						if (
							!name ||
							asset.data.layers.some(layer =>
								layer.id !== id && layer.name === name
							)
						) {
							throw new Error('Invalid or duplicate layer name');
						}

						if (asset.data.editor?.activeLayer === item.name) {
							asset.data.editor.activeLayer = name;
						}

						item.name = name;
						break;
					}

					case 'mode':
						if (!['override', 'additive'].includes(value)) {
							throw new Error('Invalid layer mode');
						}

						item.mode = value;
						break;

					case 'weight':
						if (
							!Number.isFinite(Number(value)) ||
							Number(value) < 0 ||
							Number(value) > 1
						) {
							throw new Error('Weight must be between 0 and 1');
						}

						item.weight = Number(value);
						break;

					case 'enabled':
						item.enabled = value === true;
						break;

					case 'mask': {
						const names = String(value)
							.split(',')
							.map(name => name.trim())
							.filter(Boolean);

						if (names.length) {
							item.mask = {
								include: [...new Set(names)],
								includeDescendants:
									item.mask?.includeDescendants ?? true
							};
						} else {
							item.mask = 'Full Body';
						}
						break;
					}

					case 'includeDescendants':
						if (
							item.mask &&
							typeof item.mask === 'object'
						) {
							item.mask.includeDescendants = value === true;
						}
						break;

					default:
						return;
				}
			} else if (kind === 'animationParameter') {
				switch (property) {


					case 'transitionDuration': {
						if (item.type !== 'number') return;

						const duration = Number(value);

						if (
							!Number.isFinite(duration) ||
							duration < 0 ||
							duration > 10
						) {
							throw new Error(
								'Transition duration must be between 0 and 10 seconds'
							);
						}

						item.transitionDuration = duration;
						break;
					}

					case 'name': {
						const name = String(value).trim();
						const oldName = item.name;

						if (
							!name ||
							asset.data.parameters.some(param =>
								param !== item && param.name === name
							)
						) {
							throw new Error('Invalid or duplicate parameter name');
						}

						item.name = name;

						// Preserve state transition references.
						for (const layer of asset.data.layers ?? []) {
							for (const link of layer.links ?? []) {
								for (const condition of link.conditions ?? []) {
									if (condition.parameter === oldName) {
										condition.parameter = name;
									}
								}
							}

							// Preserve blend-space axis references.
							for (const node of layer.nodes ?? []) {
								const axes = node.blendSpace?.parameters;
								if (!axes) continue;

								for (const axis of ['x', 'y']) {
									if (axes[axis] === oldName) {
										axes[axis] = name;
									}
								}
							}
						}

						this.animationStateSelection = {
							...selection,
							id: name
						};
						break;
					}

					case 'type':
						if (
							!['number', 'boolean', 'trigger'].includes(value)
						) {
							throw new Error('Invalid parameter type');
						}

						// Don't silently invalidate a configured graph.
						if (value !== item.type) {
							const referencedByTransition =
								(asset.data.layers ?? []).some(layer =>
									(layer.links ?? []).some(link =>
										(link.conditions ?? []).some(condition =>
											condition.parameter === item.name
										)
									)
								);

							const referencedByBlend =
								(asset.data.layers ?? []).some(layer =>
									(layer.nodes ?? []).some(node =>
										Object.values(
											node.blendSpace?.parameters ?? {}
										).includes(item.name)
									)
								);

							if (referencedByTransition || referencedByBlend) {
								throw new Error(
									'Remove parameter conditions and blend axes ' +
									'before changing its type'
								);
							}
						}

						item.type = value;
						item.default = value === 'boolean'
							? false
							: 0;

						if (value === 'number') {
							item.transitionDuration ??= 0.2;
						} else {
							delete item.transitionDuration;
							delete item.smoothing;
						}
						break;

					case 'default':
						if (item.type === 'trigger') return;

						if (item.type === 'boolean') {
							item.default = value === true;
						} else {
							const number = Number(value);

							if (!Number.isFinite(number)) {
								throw new Error('Default must be a number');
							}

							item.default = number;
						}
						break;

					default:
						return;
				}
			} else {
				return;
			}

			const updated = JSON.stringify(asset, null, 4) + '\n';

			const edit = new vscode.WorkspaceEdit();

			edit.replace(
				uri,
				new vscode.Range(
					document.positionAt(0),
					document.positionAt(document.getText().length)
				),
				updated
			);

			if (!await vscode.workspace.applyEdit(edit)) {
				throw new Error('Unable to update Animation State asset');
			}

			// Keep the edited document in VS Code's normal save workflow.
			await document.save();

			await this.update();
		} catch (error) {
			vscode.window.showErrorMessage(
				`Animation State: ${error.message}`
			);

			await this.update();
		}
	}


	async resolveComponentAssets(actorId, componentId) {

		if (this.activeEditor?.assetType === 'actor') {
			const selection = this.actorAssetSelection;

			if (
				!selection ||
				selection.uri !== this.activeEditor.uri ||
				selection.actor.id !== actorId
			) return;

			const component = selection.actor.components?.find(
				item => item.id === componentId
			);

			if (!component || component.type !== 'mesh') return;

			const uri = vscode.Uri.parse(selection.uri);
			const workspace = vscode.workspace.getWorkspaceFolder(uri);
			if (!workspace) return;

			const manager = new IEAssetManager(workspace.uri.fsPath);
			const resolvedAssets = {};

			await manager.scan();

			const resolve = async reference => {
				if (!reference?.id || !reference?.type) return;
				if (resolvedAssets[reference.id]) return;

				const asset = await manager.resolve(reference);
				if (!asset) return;

				resolvedAssets[reference.id] = asset;

				if (asset.type === 'material') {
					for (const key of [
						'map', 'normalMap', 'roughnessMap',
						'metalnessMap', 'emissiveMap', 'aoMap', 'alphaMap'
					]) {
						await resolve(asset.data?.[key]);
					}
				}
			};

			await resolve(component.geometry);

			for (const material of component.materials ?? []) {
				await resolve(material);
			}

			await this.view?.webview.postMessage({
				type: 'componentAssetsResolved',
				actorId,
				componentId,
				resolvedAssets
			});

			return;
		}

		if (!this.view || this.actor?.id !== actorId) return;

		const component = this.actor.components.find(
			component => component.id === componentId
		);

		if (!component || component.type !== 'mesh') return;

		const workspace = vscode.workspace.workspaceFolders?.[0];
		if (!workspace) return;

		const manager = new IEAssetManager(workspace.uri.fsPath);
		const resolvedAssets = {};

		try {
			await manager.scan();

			const resolve = async reference => {
				if (!reference?.id || !reference?.type) return;
				if (resolvedAssets[reference.id]) return;

				const asset = await manager.resolve(reference);
				if (!asset) return;

				resolvedAssets[reference.id] = asset;

				if (asset.type === 'material') {
					for (const key of [
						'map',
						'normalMap',
						'roughnessMap',
						'metalnessMap',
						'emissiveMap',
						'aoMap',
						'alphaMap'
					]) {
						if (asset.data?.[key]?.type === 'texture') {
							await resolve(asset.data[key]);
						}
					}
				}
			};

			const data = component.toJSON();

			await resolve(data.geometry);

			for (const material of data.materials ?? []) {
				await resolve(material);
			}

			if (this.actor?.id !== actorId) return;

			await this.view.webview.postMessage({
				type: 'componentAssetsResolved',
				actorId,
				componentId,
				resolvedAssets
			});
		} catch (error) {
			console.error('Failed to resolve component assets:', error);
		}
	}




	async updateComponentProperty(componentId, propertyName, value) {
		const result = await this.getSceneAndActor();
		if (!result) return;

		const { sceneUri, scene, actor } = result;

		if (actor.source?.type === 'actor') {
			const component = this.actor?.components.find(
				component => component.id === componentId
			);

			if (!component) return;

			const property = component[propertyName];

			if (
				propertyName === 'id' ||
				propertyName === 'type' ||
				!Object.prototype.hasOwnProperty.call(component, propertyName)
			) return;

			let nextValue;

			try {
				if (property instanceof IEType) {
					property.setValue(value);
					nextValue = property.getValue();
				} else if (
					propertyName === 'enabled' &&
					typeof value === 'boolean'
				) {
					nextValue = value;
				} else {
					return;
				}
			} catch (error) {
				console.error('Invalid component property:', error);
				await this.update();
				return;
			}

			actor.overrides ??= {};
			actor.overrides.components ??= {};
			actor.overrides.components[componentId] ??= {};
			actor.overrides.components[componentId][propertyName] =
				structuredClone(nextValue);

			await scene.save();
			await this.sceneEditor.refreshScene(sceneUri);
			await this.reloadActor(actor, sceneUri);
			return;
		}

		const component = actor.components.find(
			component => component.id === componentId
		);

		if (!component) return;

		if (
			!Object.prototype.hasOwnProperty.call(component, propertyName) ||
			propertyName === 'id' ||
			propertyName === 'type'
		) return;

		const property = component[propertyName];

		try {
			if (property instanceof IEType) {
				property.setValue(value);
			} else if (
				propertyName === 'enabled' &&
				typeof value === 'boolean'
			) {
				component.enabled = value;
			} else {
				return;
			}
		} catch (error) {
			console.error('Invalid component property:', error);
			await this.update();
			return;
		}

		await this.finishUpdate(sceneUri, scene, actor);
	}



	setActor(actor) {
		console.log('[Inspector] Selected actor:', actor?.name, actor?.id);
		this.actor = actor;
		this.update();
	}

	clear() {
		this.actor =
			undefined;

		this.update();
	}





	async update() {
		if (!this.view) return;

		if (this.activeEditor?.assetType === 'skeleton') {
			await this.view.webview.postMessage({
				type: 'setSkeletonSelection',
				selection:
					this.skeletonSelection?.uri === this.activeEditor.uri
						? this.skeletonSelection
						: null
			});
			return;
		}

		if (this.activeEditor?.assetType === 'animationState') {
			let selection = null;

			const current = this.animationStateSelection;

			if (current?.uri === this.activeEditor.uri) {
				if (
					current.kind === 'animationNode' ||
					current.kind === 'animationTransition'
				) {
					// Nodes may have unsaved changes in the canvas,
					// so use the latest value supplied by the editor.
					selection = current.value
						? {
							kind: current.kind,
							id: current.id,
							layerId: current.layerId,
							value: structuredClone(current.value),
							animations: current.animations ?? [],
							parameters: current.parameters ?? [],
							fromName: current.fromName,
							toName: current.toName
						}
						: null;
				} else {
					try {
						const uri = vscode.Uri.parse(
							this.activeEditor.uri
						);

						const document =
							await vscode.workspace.openTextDocument(uri);

						const asset = JSON.parse(
							document.getText()
						);

						const item =
							current.kind === 'animationLayer'
								? asset.data.layers?.find(
									layer => layer.id === current.id
								)
								: current.kind === 'animationParameter'
									? asset.data.parameters?.find(
										param => param.name === current.id
									)
									: null;

						if (item) {
							selection = {
								kind: current.kind,
								id: current.id,
								value: structuredClone(item)
							};
						}
					} catch (error) {
						console.error(
							'[IE] Animation State Properties:',
							error
						);
					}
				}
			}
			console.log('[IE Properties] Sending selection:', selection);
			await this.view.webview.postMessage({
				type: 'setAnimationStateSelection',
				selection
			});

			return;
		}


		if (
			this.activeEditor?.type === 'asset' &&
			['script', 'material'].includes(
				this.activeEditor.assetType
			)
		) {
			let assets = [];

			try {
				const editorUri = vscode.Uri.parse(
					this.activeEditor.uri
				);

				const workspace = vscode.workspace.getWorkspaceFolder(
					editorUri
				);

				if (workspace) {
					const manager = new IEAssetManager(
						workspace.uri.fsPath
					);

					await manager.scan();

					assets = manager.getAssets().map(asset => ({
						id: asset.id,
						name: asset.name,
						type: asset.type
					}));
				}
			} catch (error) {
				console.error(
					'[IE] Failed to load graph assets:',
					error
				);
			}

			await this.view.webview.postMessage({
				type: 'setGraphSelection',
				selection: this.graphSelection?.selection ?? null,
				assets
			});

			return;
		}

		const actor = this.actor;
		const componentSchemas = {};

		for (const component of actor?.components ?? []) {
			componentSchemas[component.id] =
				component.getProperties?.() ?? {};
				console.log("Component Loop: ",component, component.getProperties())
		}

		let assets = [];
		const workspace = vscode.workspace.workspaceFolders?.[0];

		if (workspace) {
			try {
				const manager = new IEAssetManager(workspace.uri.fsPath);
				await manager.scan();
				assets = manager.getAssets();
			} catch (error) {
				console.error('Failed to load assets:', error);
			}
		}


		if (
			this.activeEditor?.type === 'asset' &&
			this.activeEditor.assetType === 'actor'
		) {
			const selection =
				this.actorAssetSelection?.uri === this.activeEditor.uri
					? this.actorAssetSelection
					: null;

			const actor = selection?.actor ?? null;
			const componentSchemas = {};

			if (actor) {
				for (const component of actor.components ?? []) {
					const schema = {};

					for (const [name, value] of Object.entries(component)) {
						if (
							['id', 'type', 'resolvedGeometry', 'resolvedMaterials'].includes(name)
						) continue;

						let type;

						if (typeof value === 'boolean') {
							type = 'boolean';
						} else if (typeof value === 'number') {
							type = 'number';
						} else if (typeof value === 'string') {
							type = 'string';
						} else if (
							Array.isArray(value) &&
							value.length === 3 &&
							value.every(item => typeof item === 'number')
						) {
							type = 'vector3';
						} else if (
							name === 'geometry'
						) {
							type = 'geometry';
						} else if (
							name === 'materials' &&
							Array.isArray(value)
						) {
							schema[name] = {
								type: 'array',
								itemType: 'material'
							};
							continue;
						} else {
							continue;
						}

						schema[name] = { type };
					}

					// Actor assets are stored as plain JSON, so inferring a schema
					// from their values turns enum properties into text fields. Merge
					// the component's declared schema back in so controls such as
					// rigid-body type and collider shape remain dropdown menus.
					const ComponentClass = ComponentRegistry.get(component.type);
					const declaredSchema = ComponentClass
						? new ComponentClass().getProperties?.() ?? {}
						: {};

					componentSchemas[component.id] = {
						...schema,
						...declaredSchema
					};
				}
			}

			let assets = [];
			const uri = vscode.Uri.parse(this.activeEditor.uri);
			const workspace = vscode.workspace.getWorkspaceFolder(uri);

			if (workspace) {
				const manager = new IEAssetManager(workspace.uri.fsPath);
				await manager.scan();
				assets = manager.getAssets();
			}

			await this.view.webview.postMessage({
				type: 'setActor',
				actor,
				schema: {
					name: { type: 'string' }
				},
				componentSchemas,
				assets,
				assetMode: true,
				selectedComponentId: selection?.componentId ?? null
			});

			return;
		}


		await this.view.webview.postMessage({
			type: 'setActor',
			actor: actor?.toResolvedJSON() ?? null,
			schema: actor?.getProperties() ?? {},
			componentSchemas,
			assets
		});
	}





	async getSceneAndActor() {
		if (!this.actor) {
			return;
		}

		const activeSceneUriString =
			this.activeEditor?.type === 'scene'
				? this.activeEditor.uri
				: this.context.workspaceState.get('activeSceneUri');

		if (!activeSceneUriString) {
			return;
		}

		const sceneUri =
			vscode.Uri.parse(
				activeSceneUriString
			);

		const scene =
			new IEScene(
				sceneUri
			);

		await scene.load();

		const actor =
			scene.getActor(
				this.actor.id
			);

		if (!actor) {
			return;
		}

		return {
			sceneUri,
			scene,
			actor
		};
	}

	async finishUpdate(
		sceneUri,
		scene,
		actor
	) {
		await scene.save();

		this.actor =
			actor;

		await this.sceneEditor.refreshScene(
			sceneUri
		);

		this.update();
	}


	async reloadActor(actor, sceneUri) {
		if (!actor.isInstance()) {
			this.actor = actor;
			await this.update();
			return;
		}

		const workspace = vscode.workspace.getWorkspaceFolder(sceneUri);
		if (!workspace) return;

		const assetManager = new IEAssetManager(workspace.uri.fsPath);
		await assetManager.scan();

		const IEActorInstance = require('../IEActorInstance');
		const ActorRegistry = require('../ActorRegistry');
		const registerActors = require('../Actors/registerActors');

		registerActors();

		const resolvedData = await IEActorInstance.resolve(
			actor.toJSON(),
			assetManager
		);

		this.actor = ActorRegistry.fromJSON(resolvedData);
		await this.update();
	}



	async updateTransform(property, axis, value) {
		if (!['position', 'rotation', 'scale'].includes(property)) return;
		if (!Number.isInteger(axis) || axis < 0 || axis > 2) return;
		if (typeof value !== 'number' || !Number.isFinite(value)) return;

		const result = await this.getSceneAndActor();
		if (!result) return;

		const { sceneUri, scene, actor } = result;

		if (actor.type === 'World') return;

		if (actor.isInstance()) {
			const currentProperty = this.actor?.[property];

			if (!(currentProperty instanceof IEType)) return;

			const current = [...currentProperty.getValue()];
			current[axis] = value;

			actor.overrides ??= {};
			actor.overrides.transform ??= {};
			actor.overrides.transform[property] = current;

			await scene.save();
			await this.sceneEditor.refreshScene(sceneUri);
			await this.reloadActor(actor, sceneUri);
			return;
		}

		const actorProperty = actor[property];

		if (!(actorProperty instanceof IEType)) return;

		const current = [...actorProperty.getValue()];
		current[axis] = value;
		actorProperty.setValue(current);

		await this.finishUpdate(sceneUri, scene, actor);
	}


	async updateGeometry(
		property,
		value
	) {
		const result =
			await this.getSceneAndActor();

		if (!result) {
			return;
		}

		const {
			sceneUri,
			scene,
			actor
		} = result;

		const mesh =
			actor.getComponent(
				'mesh'
			);

		if (!mesh) {
			return;
		}

		if (!mesh.geometry) {
			mesh.geometry = {
				type:
					mesh.primitive ??
					'box'
			};
		}

		switch (property) {
			case 'type':
				mesh.geometry.type =
					String(value);
				break;

			case 'width':
			case 'height':
			case 'depth':
			case 'radius': {
				const number =
					Number(value);

				if (
					!Number.isFinite(number)
				) {
					return;
				}

				mesh.geometry[property] =
					number;

				break;
			}

			case 'widthSegments':
			case 'heightSegments': {
				const number =
					Number(value);

				if (
					!Number.isFinite(number)
				) {
					return;
				}

				mesh.geometry[property] =
					Math.max(
						1,
						Math.floor(number)
					);

				break;
			}

			default:
				return;
		}

		await this.finishUpdate(
			sceneUri,
			scene,
			actor
		);
	}

	async updateMaterial(
		index,
		property,
		value
	) {
		const result =
			await this.getSceneAndActor();

		if (!result) {
			return;
		}

		const {
			sceneUri,
			scene,
			actor
		} = result;

		const mesh =
			actor.getComponent(
				'mesh'
			);

		if (!mesh) {
			return;
		}

		if (
			!Array.isArray(
				mesh.materials
			)
		) {
			mesh.materials = [
				{
					type:
						'standard',

					color:
						'#ffffff',

					metalness:
						0,

					roughness:
						1,

					wireframe:
						false
				}
			];
		}

		const material =
			mesh.materials[index];

		if (!material) {
			return;
		}

		switch (property) {
			case 'type':
				material.type =
					String(value);
				break;

			case 'color':
				material.color =
					String(value);
				break;

			case 'metalness':
			case 'roughness': {
				const number =
					Number(value);

				if (
					!Number.isFinite(number)
				) {
					return;
				}

				material[property] =
					Math.min(
						1,
						Math.max(
							0,
							number
						)
					);

				break;
			}

			case 'wireframe':
				material.wireframe =
					Boolean(value);
				break;

			default:
				return;
		}

		await this.finishUpdate(
			sceneUri,
			scene,
			actor
		);
	}


}

module.exports =
	IEPropertiesProvider;
