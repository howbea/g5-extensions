/* extension.js
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

/* exported init */

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Atk from 'gi://Atk';
import St from 'gi://St';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import * as DND from 'resource:///org/gnome/shell/ui/dnd.js';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Layout from 'resource:///org/gnome/shell/ui/layout.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

const BUTTON_DND_ACTIVATION_TIMEOUT = 250;

const HOT_CORNER_PRESSURE_THRESHOLD = 100;
const HOT_CORNER_PRESSURE_TIMEOUT = 1000;

export const HotCornerPlus = GObject.registerClass(
class HotCornerPlus extends Clutter.Actor {
    _init(layoutManager, monitor) {
        super._init();

        this._monitor = monitor;

        this._pressureBarrier = new Layout.PressureBarrier(
            HOT_CORNER_PRESSURE_THRESHOLD,
            HOT_CORNER_PRESSURE_TIMEOUT,
            Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW);

        this._pressureBarrier.connect(
            'trigger',
            this._toggleOverview.bind(this));

        this._verticalBarrier = null;
        this._horizontalBarrier = null;

        this.connect('destroy', this._onDestroy.bind(this));
    }

    setBarrierSize(size) {
    if (this._verticalBarrier) {
        this._pressureBarrier.removeBarrier(this._verticalBarrier);
        this._verticalBarrier.destroy();
        this._verticalBarrier = null;
    }

    if (this._horizontalBarrier) {
        this._pressureBarrier.removeBarrier(this._horizontalBarrier);
        this._horizontalBarrier.destroy();
        this._horizontalBarrier = null;
    }

    if (size > 0) {
        this._verticalBarrier = new Meta.Barrier({
            backend: global.backend,
            x1: this._monitor.x,
            x2: this._monitor.x,
            y1: this._monitor.y,
            y2: this._monitor.y + size,
            directions: Meta.BarrierDirection.POSITIVE_X,
        });

        this._horizontalBarrier = new Meta.Barrier({
            backend: global.backend,
            x1: this._monitor.x,
            x2: this._monitor.x + this._monitor.width,
            y1: this._monitor.y,
            y2: this._monitor.y,
            directions: Meta.BarrierDirection.POSITIVE_Y,
        });

        this._pressureBarrier.addBarrier(this._verticalBarrier);
        this._pressureBarrier.addBarrier(this._horizontalBarrier);
    }
}

    _onDestroy() {
        this.setBarrierSize(0);

        this._pressureBarrier.destroy();
        this._pressureBarrier = null;
    }

    _toggleOverview() {
        if (this._monitor.inFullscreen && !Main.overview.visible)
            return;

        if (Main.overview.shouldToggleByCornerOrButton())
            Main.overview.toggle();
    }
});

const ActivitiesIndicator = GObject.registerClass(
class ActivitiesIndicator extends PanelMenu.Button {
    _init() {
        super._init(0.0, null, true);

        this.set({
            name: 'panelActivities',
            accessible_role: Atk.Role.TOGGLE_BUTTON,
            /* Translators: If there is no suitable word for "Activities"
               in your language, you can use the word for "Overview". */
            accessible_name: _('Activities'),
        });

        let bin = new St.Bin();
        this.add_child(bin);
        
        this._container = new St.BoxLayout();
        bin.set_child(this._container);
        
        this._iconBox = new St.Bin({
        y_align: Clutter.ActorAlign.CENTER,
        });         
        this._container.add_child(this._iconBox);
        
        const icon = new St.Icon({
            icon_name: 'system-search-symbolic',
            style_class: 'activities-icon',
        });
        this._iconBox.set_child(icon);

        Main.overview.connectObject('showing',
            () => this.add_style_pseudo_class('checked'),
            this);
        Main.overview.connectObject('hiding',
            () => this.remove_style_pseudo_class('checked'),
            this);
            
        this._updateHotCorners();

        this._xdndTimeOut = 0;
    }
    
    handleDragOver(source, _actor, _x, _y, _time) {
        if (source !== Main.xdndHandler)
            return DND.DragMotionResult.CONTINUE;

        if (this._xdndTimeOut !== 0)
            GLib.source_remove(this._xdndTimeOut);
        this._xdndTimeOut = GLib.timeout_add(GLib.PRIORITY_DEFAULT, BUTTON_DND_ACTIVATION_TIMEOUT, () => {
            this._xdndToggleOverview();
        });
        GLib.Source.set_name_by_id(this._xdndTimeOut, '[gnome-shell] this._xdndToggleOverview');

        return DND.DragMotionResult.CONTINUE;
    }

    vfunc_event(event) {
        if (event.type() === Clutter.EventType.TOUCH_END ||
            event.type() === Clutter.EventType.BUTTON_RELEASE) {
            if (Main.overview.shouldToggleByCornerOrButton())
                Main.overview.toggle();
        }

        return Main.wm.handleWorkspaceScroll(event);
    }

    vfunc_key_release_event(event) {
        let symbol = event.get_key_symbol();
        if (symbol === Clutter.KEY_Return || symbol === Clutter.KEY_space) {
            if (Main.overview.shouldToggleByCornerOrButton()) {
                Main.overview.toggle();
                return Clutter.EVENT_STOP;
            }
        }

        return Clutter.EVENT_PROPAGATE;
    }

    _xdndToggleOverview() {
        let [x, y] = global.get_pointer();
        let pickedActor = global.stage.get_actor_at_pos(Clutter.PickMode.REACTIVE, x, y);

        if (pickedActor === this && Main.overview.shouldToggleByCornerOrButton())
            Main.overview.toggle();

        GLib.source_remove(this._xdndTimeOut);
        this._xdndTimeOut = 0;
        return GLib.SOURCE_REMOVE;
    }
    
    _updateHotCorners() {    
        Main.layoutManager._destroyHotCorners();

        const size = Main.layoutManager.panelBox.height;

        for (const monitor of Main.layoutManager.monitors) {
            const hotCornerPlus = new HotCornerPlus(
                Main.layoutManager,
                monitor,
            );

            hotCornerPlus.setBarrierSize(size);

            Main.layoutManager.hotCorners.push(hotCornerPlus);
        }
        Main.layoutManager.emit('hot-corners-changed');
    }
    
    destroy() {

        if (this._xdndTimeOut) {
            GLib.Source.remove(this._xdndTimeOut);
            this._xdndTimeOut = null;
        }   
        
        super.destroy();
    }
});

export default class ActivitiesExtension extends Extension {

    enable() {
        const activities = Main.panel.statusArea['activities'];
        const index = Main.panel._rightBox.get_children().indexOf(activities.container);
        Main.panel.statusArea['activities'].hide();
        this._indicator = new ActivitiesIndicator();
        Main.panel.addToStatusArea(this._uuid, this._indicator, index, 'right');
    }

    disable() {
        this._indicator.destroy();
        this._indicator = null;
        if(Main.sessionMode.currentMode !== 'unlock-dialog') {
        Main.panel.statusArea['activities'].show();
        }
    }
}
