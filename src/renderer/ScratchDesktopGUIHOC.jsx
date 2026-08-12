import {ipcRenderer} from 'electron';
import {dialog} from '@electron/remote';
import * as remote from '@electron/remote/renderer';
import bindAll from 'lodash.bindall';
import omit from 'lodash.omit';
import PropTypes from 'prop-types';
import React from 'react';
import {connect} from 'react-redux';
import GUIComponent from 'openblock-gui/src/components/gui/gui.jsx';
import {FormattedMessage} from 'react-intl';

import {
    LoadingStates,
    onFetchedProjectData,
    onLoadedProject,
    defaultProjectId,
    requestNewProject,
    requestProjectUpload,
    setProjectId
} from 'openblock-gui/src/reducers/project-state';
import {
    openLoadingProject,
    closeLoadingProject,
    openTelemetryModal,
    openUpdateModal
} from 'openblock-gui/src/reducers/modals';
import {setUpdate} from 'openblock-gui/src/reducers/update';
import {setSession} from 'openblock-gui/src/reducers/session';

import MessageBoxType from 'openblock-gui/src/lib/message-box.js';

import log from '../common/log.js';
import ElectronStorageHelper from '../common/ElectronStorageHelper';

import showPrivacyPolicy from './showPrivacyPolicy';

const getPlatformHost = () => {
    if (typeof window !== 'undefined' && window.OpenBlockPlatformHost) {
        return String(window.OpenBlockPlatformHost).replace(/\/$/, '');
    }
    return 'https://www.haoxuekeji.com';
};

/**
 * Higher-order component to add desktop logic to the GUI.
 * @param {Component} WrappedComponent - a GUI-like component to wrap.
 * @returns {Component} - a component similar to GUI with desktop-specific logic added.
 */
const ScratchDesktopGUIHOC = function (WrappedComponent) {
    class ScratchDesktopGUIComponent extends React.Component {
        constructor (props) {
            super(props);
            bindAll(this, [
                'handleProjectTelemetryEvent',
                'handleSetTitleFromSave',
                'handleShowMessageBox',
                'handleStorageInit',
                'handleUpdateProjectTitle',
                'handleUpdateProjectThumbnail',
                'handleLogIn',
                'handleLogOut',
                'restoreSessionFromToken'
            ]);
            this.platformHost = getPlatformHost();
            this.props.onLoadingStarted();
            ipcRenderer.invoke('get-initial-project-data').then(initialProjectData => {
                const hasInitialProject = initialProjectData && (initialProjectData.length > 0);
                this.props.onHasInitialProject(hasInitialProject, this.props.loadingState);
                if (!hasInitialProject) {
                    this.props.onLoadingCompleted();
                    ipcRenderer.send('loading-completed');
                    return;
                }
                this.props.vm.loadProject(initialProjectData).then(
                    () => {
                        this.props.onLoadingCompleted();
                        ipcRenderer.send('loading-completed');
                        this.props.onLoadedProject(this.props.loadingState, true);
                    },
                    e => {
                        this.props.onLoadingCompleted();
                        ipcRenderer.send('loading-completed');
                        this.props.onLoadedProject(this.props.loadingState, false);
                        dialog.showMessageBox(remote.getCurrentWindow(), {
                            type: 'error',
                            title: 'Failed to load project',
                            message: 'Invalid or corrupt project file.',
                            detail: e.message
                        });

                        this.props.onHasInitialProject(false, this.props.loadingState);
                        this.props.onRequestNewProject();
                    }
                );
            });
            ipcRenderer.send('set-locale', this.props.locale);
        }
        componentDidMount () {
            ipcRenderer.on('setTitleFromSave', this.handleSetTitleFromSave);
            ipcRenderer.on('setUpdate', (event, args) => {
                this.props.onSetUpdate(args);
            });
            ipcRenderer.on('setUserId', () => {});
            ipcRenderer.on('setPlatform', (event, args) => {
                this.platform = args;
            });
            // Expose setSession the same way the web playground does, so
            // login handlers and future embedding code can update the session.
            if (typeof window !== 'undefined') {
                window.setSession = this.props.onSetSession;
            }
            this.restoreSessionFromToken();
        }
        componentWillUnmount () {
            ipcRenderer.removeListener('setTitleFromSave', this.handleSetTitleFromSave);
        }
        restoreSessionFromToken () {
            let token = '';
            try {
                token = window.localStorage.getItem('token') || '';
            } catch (e) {
                token = '';
            }
            if (!token) return;

            fetch(`${this.platformHost}/api/v1/users/me`, {
                headers: {Authorization: `Bearer ${token}`}
            })
                .then(res => (res.ok ? res.json() : Promise.reject(res.status)))
                .then(user => {
                    this.props.onSetSession({
                        session: {
                            user: {
                                userid: user.id,
                                username: user.username || '',
                                thumbnailUrl: user.avatar_url || '',
                                token: token
                            }
                        }
                    });
                })
                .catch(() => {
                    try {
                        window.localStorage.removeItem('token');
                    } catch (e) { /* ignore */ }
                });
        }
        handleClickAbout () {
            ipcRenderer.send('open-about-window');
        }
        handleClickCheckUpdate () {
            ipcRenderer.send('reqeustCheckUpdate');
        }
        handleClickUpdate () {
            ipcRenderer.send('reqeustUpdate');
        }
        handleAbortUpdate () {
            ipcRenderer.send('abortUpdate');
        }
        handleClickClearCache () {
            ipcRenderer.send('clearCache');
        }
        handleClickInstallDriver () {
            ipcRenderer.send('installDriver');
        }
        handleProjectTelemetryEvent (event, metadata) {
            ipcRenderer.send(event, metadata);
        }
        handleSetTitleFromSave (event, args) {
            this.handleUpdateProjectTitle(args.title);
        }
        handleStorageInit (storageInstance) {
            // Local costume/sound assets shipped with the app.
            storageInstance.addHelper(new ElectronStorageHelper(storageInstance));
            // Cloud project create/update against the platform API.
            storageInstance.addOfficialScratchWebStores();
            storageInstance.setProjectHost(`${this.platformHost}/api/v1/scratch/project`);
            storageInstance.setAssetHost(this.platformHost);
        }
        handleUpdateProjectTitle (newTitle) {
            this.setState({projectTitle: newTitle});
        }
        /**
         * Upload the stage snapshot as the project cover after each save, so
         * the platform "my works" list shows an up-to-date thumbnail.
         * @param {string} projectId - platform project id
         * @param {Blob} blob - PNG snapshot of the stage
         */
        handleUpdateProjectThumbnail (projectId, blob) {
            let token = '';
            try {
                token = window.localStorage.getItem('token') || '';
            } catch (e) {
                token = '';
            }
            if (!token) return;
            fetch(`${this.platformHost}/api/v1/scratch/project/thumbnail/${projectId}`, {
                method: 'POST',
                headers: {Authorization: `Bearer ${token}`},
                body: blob
            }).catch(err => {
                log.error('Could not upload project thumbnail', err);
            });
        }
        /**
         * LoginDropdown calls onLogIn(form, onClose, callback).
         * Accept both the 3-arg form and the 2-arg web playground form.
         */
        handleLogIn (form, onClose, callback) {
            const done = typeof callback === 'function' ? callback :
                (typeof onClose === 'function' ? onClose : () => {});
            const close = typeof callback === 'function' ? onClose : null;

            if (!form || !form.username || !form.password) {
                done({success: false, message: '缺少用户名或密码'});
                return;
            }

            fetch(`${this.platformHost}/api/v1/auth/login`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    username: form.username,
                    password: form.password
                })
            })
                .then(res => (res.ok ? res.json() :
                    res.json().then(err => Promise.reject(err))))
                .then(data => {
                    if (!(data && data.access_token)) {
                        done({success: false, message: '登录失败'});
                        return;
                    }
                    const profile = data.user || {};
                    try {
                        window.localStorage.setItem('token', data.access_token);
                    } catch (e) { /* ignore */ }
                    this.props.onSetSession({
                        session: {
                            user: {
                                userid: profile.id || 0,
                                username: profile.username || form.username,
                                thumbnailUrl: profile.avatar_url || '',
                                token: data.access_token
                            }
                        }
                    });
                    done({success: true, access_token: data.access_token});
                    if (typeof close === 'function') close();
                })
                .catch(err => {
                    done({
                        success: false,
                        message: (err && (err.detail || err.message)) || '网络错误'
                    });
                });
        }
        handleLogOut () {
            try {
                window.localStorage.removeItem('token');
            } catch (e) { /* ignore */ }
            this.props.onSetSession({
                session: {
                    user: {
                        userid: 0,
                        username: '',
                        thumbnailUrl: '',
                        token: ''
                    }
                }
            });
        }
        handleShowMessageBox (type, message) {
            /**
             * To avoid the electron bug: the input-box lose focus after call alert or confirm on windows platform.
             * https://github.com/electron/electron/issues/19977
            */
            if (this.platform === 'win32') {
                let options;
                if (type === MessageBoxType.confirm) {
                    options = {
                        type: 'warning',
                        buttons: ['Ok', 'Cancel'],
                        message: message
                    };
                } else if (type === MessageBoxType.alert) {
                    options = {
                        type: 'error',
                        message: message
                    };
                }
                const result = dialog.showMessageBoxSync(remote.getCurrentWindow(), options);
                if (result === 0) {
                    return true;
                }
                return false;
            }
            if (type === 'confirm') {
                return confirm(message); // eslint-disable-line no-alert
            }
            return alert(message); // eslint-disable-line no-alert
        }
        render () {
            const childProps = omit(this.props, Object.keys(ScratchDesktopGUIComponent.propTypes));
            const loggedIn = Boolean(this.props.username);
            const cloudHost = `${this.platformHost.replace(/^https?:\/\//, '')}/api/v1/scratch/cloud` +
                (this.props.token ? `?token=${encodeURIComponent(this.props.token)}` : '');

            return (<WrappedComponent
                canEditTitle
                // Desktop loads from file:// (or asar); absolute /scratch3/ media
                // paths break block icons (green flag, wait, forever, ...).
                basePath="./"
                // Only offer cloud create/copy once logged in; otherwise the
                // saver HOC auto-POSTs a new project and pops "无法创建作品".
                canCreateNew={loggedIn}
                canCreateCopy={loggedIn}
                canManageFiles
                canModifyCloudData={loggedIn}
                canSave={loggedIn}
                hasCloudPermission={loggedIn}
                isScratchDesktop
                projectHost={`${this.platformHost}/api/v1/scratch/project`}
                backpackHost={`${this.platformHost}/api/v1/scratch/backpack`}
                cloudHost={cloudHost}
                renderLogin={this.handleLogIn}
                onLogOut={this.handleLogOut}
                onClickAbout={[
                    {
                        title: (<FormattedMessage
                            defaultMessage="About"
                            description="Menu bar item for about"
                            id="gui.desktopMenuBar.about"
                        />),
                        onClick: () => this.handleClickAbout()
                    },
                    {
                        title: (<FormattedMessage
                            defaultMessage="Privacy policy"
                            description="Menu bar item for privacy policy"
                            id="gui.menuBar.privacyPolicy"
                        />),
                        onClick: () => showPrivacyPolicy()
                    },
                    {
                        title: (<FormattedMessage
                            defaultMessage="Data settings"
                            description="Menu bar item for data settings"
                            id="gui.menuBar.dataSettings"
                        />),
                        onClick: () => this.props.onTelemetrySettingsClicked()
                    }
                ]}
                onClickLogo={this.handleClickLogo}
                onClickCheckUpdate={this.handleClickCheckUpdate}
                onClickUpdate={this.handleClickUpdate}
                onAbortUpdate={this.handleAbortUpdate}
                onClickInstallDriver={this.handleClickInstallDriver}
                onClickClearCache={this.handleClickClearCache}
                onProjectTelemetryEvent={this.handleProjectTelemetryEvent}
                onShowMessageBox={this.handleShowMessageBox}
                onShowPrivacyPolicy={showPrivacyPolicy}
                onStorageInit={this.handleStorageInit}
                onUpdateProjectTitle={this.handleUpdateProjectTitle}
                onUpdateProjectThumbnail={this.handleUpdateProjectThumbnail}

                // allow passed-in props to override any of the above
                {...childProps}
            />);
        }
    }

    ScratchDesktopGUIComponent.propTypes = {
        loadingState: PropTypes.oneOf(LoadingStates),
        locale: PropTypes.string.isRequired,
        onFetchedInitialProjectData: PropTypes.func,
        onHasInitialProject: PropTypes.func,
        onLoadedProject: PropTypes.func,
        onLoadingCompleted: PropTypes.func,
        onLoadingStarted: PropTypes.func,
        onRequestNewProject: PropTypes.func,
        onSetSession: PropTypes.func,
        onTelemetrySettingsClicked: PropTypes.func,
        onSetUpdate: PropTypes.func,
        token: PropTypes.string,
        username: PropTypes.string,
        // using PropTypes.instanceOf(VM) here will cause prop type warnings due to VM mismatch
        vm: GUIComponent.WrappedComponent.propTypes.vm
    };
    const mapStateToProps = state => {
        const loadingState = state.scratchGui.projectState.loadingState;
        const user = state.session && state.session.session && state.session.session.user;
        return {
            loadingState: loadingState,
            locale: state.locales.locale,
            username: user ? user.username : '',
            token: user ? user.token : '',
            vm: state.scratchGui.vm
        };
    };
    const mapDispatchToProps = dispatch => ({
        onLoadingStarted: () => dispatch(openLoadingProject()),
        onLoadingCompleted: () => dispatch(closeLoadingProject()),
        onHasInitialProject: (hasInitialProject, loadingState) => {
            if (hasInitialProject) {
                return dispatch(requestProjectUpload(loadingState));
            }
            return dispatch(setProjectId(defaultProjectId));
        },
        onFetchedInitialProjectData: (projectData, loadingState) =>
            dispatch(onFetchedProjectData(projectData, loadingState)),
        onLoadedProject: (loadingState, loadSuccess) => {
            // Only mark the project as cloud-saveable after a successful login;
            // otherwise the first load tries to POST /scratch/project and pops
            // "Unable to create project".
            const canSaveToServer = false;
            return dispatch(onLoadedProject(loadingState, canSaveToServer, loadSuccess));
        },
        onRequestNewProject: () => dispatch(requestNewProject(false)),
        onSetSession: session => dispatch(setSession(session)),
        onSetUpdate: arg => {
            dispatch(setUpdate(arg));
            dispatch(openUpdateModal());
        },
        onTelemetrySettingsClicked: () => dispatch(openTelemetryModal())
    });

    return connect(mapStateToProps, mapDispatchToProps)(ScratchDesktopGUIComponent);
};

export default ScratchDesktopGUIHOC;
