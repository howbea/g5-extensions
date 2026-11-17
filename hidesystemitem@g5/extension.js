import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import {SystemIndicator} from 'resource:///org/gnome/shell/ui/quickSettings.js';

import * as DoNotDisturb from './doNotDisturb.js';

let _id;

const SHOW_BATTERY_PERCENTAGE = 'show-battery-percentage';

const NotificationsIndicator = GObject.registerClass(
class NotificationsIndicator extends SystemIndicator {
    _init() {
        super._init({
            style_class: 'system-status-icon',
        });

        this._indicator = this._addIndicator();
        this._indicator.icon_name = 'org.gnome.Settings-notifications-symbolic';

        this._settings = new Gio.Settings({
            schema_id: 'org.gnome.desktop.notifications',
        });

        this._sync();

        this._settings.connectObject(
            'changed::show-banners', () => this._sync(), this);
    }

    _sync() {
        this._indicator.visible =
            this._settings.get_boolean('show-banners');
    }
});

const BatteryIndicator = GObject.registerClass(
class BatteryIndicator extends SystemIndicator {
    _init() {
        super._init();

        this._desktopSettings = new Gio.Settings({
            schema_id: 'org.gnome.desktop.interface',
        });

        this._desktopSettings.connectObject(
            `changed::${SHOW_BATTERY_PERCENTAGE}`,
            () => this._sync(), this);

        this._indicator = this._addIndicator();

        this._percentageLabel = new St.Label({
            y_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });

        this.add_child(this._percentageLabel);
        this.add_style_class_name('power-status');

        this._systemItem =
            Main.panel.statusArea.quickSettings._system._systemItem;

        const {powerToggle} = this._systemItem;

        powerToggle.bind_property(
            'title',
            this._percentageLabel,
            'text',
            GObject.BindingFlags.SYNC_CREATE);

        powerToggle.connectObject(
            'notify::visible', () => this._sync(),
            'notify::gicon', () => this._sync(),
            'notify::fallback-icon-name', () => this._sync(),
            this);

        this._sync();
    }

    _sync() {
        const {powerToggle} = this._systemItem;

        if (powerToggle.visible) {
            this._indicator.set({
                gicon: powerToggle.gicon,
                fallback_icon_name: powerToggle.fallback_icon_name,
            });

            this._percentageLabel.visible =
                this._desktopSettings.get_boolean(SHOW_BATTERY_PERCENTAGE);

            Main.panel.statusArea.quickSettings._system._systemItem.show();
        } else {
            this._indicator.icon_name = '';
            this._percentageLabel.hide();
            this.visible = false;

            Main.panel.statusArea.quickSettings._system._systemItem.hide();
        }
    }
});

export default class QuickSettingsExampleExtension extends Extension {
    _modifySystemItem() {
        const quickSettings = Main.panel.statusArea.quickSettings;
        const systemItem = quickSettings._system._systemItem;
        const children = systemItem.child.get_children();

        const settingsItem = children.find(
            child => child.constructor.name === 'SettingsItem');

        const shutdownItem = children.find(
            child => child.constructor.name === 'ShutdownItem');

        const screenshotItem = children.find(
            child => child.constructor.name === 'ScreenshotItem');

        const lockItem = children.find(
            child => child.constructor.name === 'LockItem');

        settingsItem.hide();
        shutdownItem.hide();
        screenshotItem.hide();
        lockItem.hide();

        if(quickSettings._doNotDisturb)
            quickSettings._indicators.remove_child(quickSettings._doNotDisturb);

        this._doNotDisturb = new DoNotDisturb.Indicator();
        quickSettings._indicators.add_child(this._doNotDisturb);

        this._notificationsIndicator = new NotificationsIndicator();
        quickSettings._indicators.add_child(this._notificationsIndicator);

        quickSettings._system.hide();

        this._batteryIndicator = new BatteryIndicator();
        quickSettings._indicators.add_child(this._batteryIndicator);

        this._sditemsig = shutdownItem.connect(
            'notify::visible', () => shutdownItem.hide());
    }

    _queueModifySystemItem() {
        GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            if (!Main.panel.statusArea.quickSettings._system)
                return GLib.SOURCE_CONTINUE;

            this._modifySystemItem();
            return GLib.SOURCE_REMOVE;
        });
    }

    enable() {
        if (Main.panel.statusArea.quickSettings._system)
            this._modifySystemItem();
        else
            this._queueModifySystemItem();

        const indicator = Main.panel.statusArea.dateMenu._indicator;

        _id = indicator.connect('notify::visible', () => {
            if (!indicator._count)
                indicator.visible = false;
        });

        if (!indicator._count)
            indicator.visible = false;
    }

    disable() {
        const quickSettings = Main.panel.statusArea.quickSettings;
        const children = quickSettings._system._systemItem.child.get_children();

        const settingsItem = children.find(
            child => child.constructor.name === 'SettingsItem');

        const shutdownItem = children.find(
            child => child.constructor.name === 'ShutdownItem');

        const screenshotItem = children.find(
            child => child.constructor.name === 'ScreenshotItem');

        const lockItem = children.find(
            child => child.constructor.name === 'LockItem');

        settingsItem.show();
        screenshotItem.show();
        lockItem.show();

        quickSettings._system.show();

        this._doNotDisturb.destroy();
        this._notificationsIndicator.destroy();
        this._batteryIndicator.destroy();

        shutdownItem.disconnect(this._sditemsig);
        shutdownItem.show();

        const index = quickSettings._indicators.get_children().indexOf(quickSettings._darkMode);
        
        if(quickSettings._doNotDisturb)
        quickSettings._indicators.insert_child_at_index(quickSettings._doNotDisturb, index +1);

        quickSettings._system._systemItem.show();

        const indicator = Main.panel.statusArea.dateMenu._indicator;

        if (_id) {
            indicator.disconnect(_id);
            _id = null;
        }
    }
}
