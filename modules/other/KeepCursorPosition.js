import { BufferUtils, GLFW, IS_MC_26_3 } from '../../utils/Constants';
import { mc } from '../../utils/Utils';
import { Categories } from '../../gui/categories/CategorySystem';

const AbstractContainerScreen = Java.type('net.minecraft.client.gui.screens.inventory.AbstractContainerScreen');
const InputCompat = Java.type('com.chattriggers.ctjs.internal.utils.InputCompat');
const SDLMouse = IS_MC_26_3 ? Java.type('org.lwjgl.sdl.SDLMouse') : null;
const cursorX = IS_MC_26_3 ? null : BufferUtils.createDoubleBuffer(1);
const cursorY = IS_MC_26_3 ? null : BufferUtils.createDoubleBuffer(1);
let mouseFields = null;
try {
    const fields = {};
    for (const name of ['mouseGrabbed', 'xpos', 'ypos']) {
        const field = mc.mouseHandler.getClass().getDeclaredField(name);
        field.setAccessible(true);
        fields[name] = field;
    }
    mouseFields = fields;
} catch {
    mouseFields = null;
}

class KeepCursorPosition {
    constructor() {
        this.position = null;
        this.tooltipScreen = null;
        this.closingWithKey = false;

        this.registers = [
            register('guiKey', (_char, keyCode, screen) => {
                if (!(screen instanceof AbstractContainerScreen)) return;
                if (Number(keyCode) !== 256 && !mc.options.keyInventory.matches(InputCompat.key(keyCode))) return;

                this.closingWithKey = true;
                this.position = null;
                this.tooltipScreen = null;
            }),
            register('guiClosed', (screen) => this.onGuiClosed(screen)),
            register('guiRender', (_mouseX, _mouseY, screen) => {
                this.closingWithKey = false;
                this.savePosition(screen);
            }),
            register('guiOpened', (screen) => this.onGuiOpened(screen)),
            register('itemTooltip', (_lore, _item, event) => {
                if (this.tooltipScreen && this.tooltipScreen === Client.getCurrentScreen()) cancel(event);
            }),
            register('postGuiRender', (_mouseX, _mouseY, screen) => {
                if (this.tooltipScreen === screen) this.tooltipScreen = null;
            }),
        ];
        this.setEnabled(true);
    }

    setEnabled(enabled) {
        enabled = enabled && mouseFields !== null;
        this.registers.forEach((trigger) => (enabled ? trigger.register() : trigger.unregister()));
        if (enabled) return;

        this.position = null;
        this.tooltipScreen = null;
        this.closingWithKey = false;
    }

    onGuiClosed(screen) {
        if (!this.closingWithKey) this.savePosition(screen);
    }

    savePosition(screen) {
        const mouse = mc.mouseHandler;
        if (!(screen instanceof AbstractContainerScreen) || mouse.isMouseGrabbed()) return;

        if (IS_MC_26_3) {
            mouse.resyncMousePosition();
        } else {
            GLFW.glfwGetCursorPos(mc.getWindow().handle(), cursorX, cursorY);
            mouseFields.xpos.setDouble(mouse, cursorX.get(0));
            mouseFields.ypos.setDouble(mouse, cursorY.get(0));
        }
        this.position = { x: mouse.xpos(), y: mouse.ypos() };
    }

    onGuiOpened(screen) {
        if (this.closingWithKey) {
            this.closingWithKey = false;
            return;
        }
        if (!(screen instanceof AbstractContainerScreen)) return;

        this.savePosition(Client.getCurrentScreen());
        this.tooltipScreen = this.position ? screen : null;
        if (this.position && mc.mouseHandler.isMouseGrabbed()) this.restorePosition();
    }

    restorePosition() {
        const mouse = mc.mouseHandler;
        const handle = mc.getWindow().handle();
        const { x, y } = this.position;

        if (IS_MC_26_3) {
            SDLMouse.SDL_SetWindowRelativeMouseMode(handle, false);
            SDLMouse.SDL_WarpMouseInWindow(handle, x, y);
        } else {
            GLFW.glfwSetInputMode(handle, GLFW.GLFW_CURSOR, GLFW.GLFW_CURSOR_HIDDEN);
            GLFW.glfwSetCursorPos(handle, x, y);
            GLFW.glfwSetInputMode(handle, GLFW.GLFW_CURSOR, GLFW.GLFW_CURSOR_NORMAL);
        }

        // Native mode changes can overwrite coordinates; sync them after releasing.
        mouseFields.xpos.setDouble(mouse, x);
        mouseFields.ypos.setDouble(mouse, y);
        mouseFields.mouseGrabbed.setBoolean(mouse, false);
    }
}

const keepCursorPosition = new KeepCursorPosition();
Categories.addSettingsToggle(
    'Keep Cursor Position',
    (enabled) => keepCursorPosition.setEnabled(!!enabled),
    'Keeps the mouse cursor in place when opening container screens.',
    true,
    'Other'
);
