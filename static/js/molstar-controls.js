(() => {
    "use strict";

    const confidenceViewers = new WeakSet();
    const confidenceTheme = {
        color: "uncertainty",
        colorParams: {
            domain: [0, 100],
            list: {
                kind: "interpolate",
                colors: [3367393, 16777215, 12526114]
            }
        }
    };

    function getStructureRef(viewer) {
        return viewer?.plugin?.managers?.structure?.hierarchy?.current?.structures?.[0];
    }

    function getPolymerComponents(structureRef) {
        return structureRef?.components?.filter(component =>
            /polymer/i.test(String(component.key || ""))
        ) || [];
    }

    function hasBFactorValues(structure) {
        for (const unit of structure.units || []) {
            const bFactors = unit.model?.atomicConformation?.B_iso_or_equiv;
            if (!bFactors?.isDefined) continue;
            for (const element of unit.elements) {
                if (Number.isFinite(bFactors.value(element))) return true;
            }
        }
        return false;
    }

    async function setRepresentation(viewer, representation, theme) {
        const structureRef = getStructureRef(viewer);
        if (!structureRef) {
            throw new Error("No viewable structure has been loaded.");
        }

        const components = getPolymerComponents(structureRef);
        if (!components.length) {
            throw new Error("The current structure has no polymer components with a switchable representation.");
        }

        const manager = viewer.plugin.managers.structure.component;
        await manager.removeRepresentations(components);
        await manager.addRepresentation(components, representation);

        const updatedComponents = getPolymerComponents(getStructureRef(viewer));
        if (!updatedComponents.length) {
            throw new Error("No polymer components were found after updating the structure representation.");
        }

        await manager.updateRepresentationsTheme(
            updatedComponents,
            theme || (confidenceViewers.has(viewer) ? confidenceTheme : { color: "chain-id" })
        );
    }

    window.molstarControls = {
        resetCamera(viewer) {
            if (!viewer?.plugin?.managers?.camera) {
                throw new Error("The Mol* camera has not been initialized.");
            }
            viewer.plugin.managers.camera.reset();
        },
        async setCartoon(viewer) {
            await setRepresentation(viewer, "cartoon");
        },
        async setSurface(viewer) {
            await setRepresentation(viewer, "molecular-surface");
        },
        async setConfidence(viewer) {
            const structure = getStructureRef(viewer)?.cell?.obj?.data;
            if (!structure) {
                throw new Error("No viewable structure has been loaded.");
            }
            if (!hasBFactorValues(structure)) {
                throw new Error("No PDB B-factor scores are available for the current AlphaFold structure.");
            }
            await setRepresentation(viewer, "cartoon", confidenceTheme);
            confidenceViewers.add(viewer);
        },
        resetConfidence(viewer) {
            confidenceViewers.delete(viewer);
        },
        async toggleFullscreen(element) {
            if (document.fullscreenElement) {
                await document.exitFullscreen();
                return;
            }
            if (!element?.requestFullscreen) {
                throw new Error("Fullscreen view is not supported by this browser.");
            }
            await element.requestFullscreen();
        }
    };
})();
