import { useState, useEffect } from 'react';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../../context/ConfirmContext';
import {
  getGuildChannels,
  getGuildSettings,
  updateGuildSettings,
  deleteTestMovies
} from '../../api/client';

const AdminSettingsPanel = ({ onDataRefresh }) => {
  const { showError } = useToast();
  const confirm = useConfirm();
  const [showAdminSettings, setShowAdminSettings] = useState(false);
  const [testMode, setTestMode] = useState(false);
  const [testChannelId, setTestChannelId] = useState('');
  const [channels, setChannels] = useState([]);
  const [testMovieCount, setTestMovieCount] = useState(0);
  const [savingSettings, setSavingSettings] = useState(false);
  const [deletingTestMovies, setDeletingTestMovies] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  useEffect(() => {
    if (!showAdminSettings || settingsLoaded) return;

    const loadAdminSettings = async () => {
      try {
        const [channelsData, settingsData] = await Promise.all([
          getGuildChannels(),
          getGuildSettings()
        ]);
        setChannels(channelsData);
        setTestMode(settingsData.test_mode || false);
        setTestChannelId(settingsData.test_channel_id || '');
        setTestMovieCount(settingsData.test_movie_count || 0);
        setSettingsLoaded(true);
      } catch (err) {
        console.error('Error loading admin settings:', err);
      }
    };

    loadAdminSettings();
  }, [showAdminSettings, settingsLoaded]);

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      await updateGuildSettings({
        test_mode: testMode,
        test_channel_id: testChannelId || null
      });
    } catch (err) {
      console.error('Error saving settings:', err);
      showError('Failed to save settings');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleDeleteTestMovies = async () => {
    if (!(await confirm({ title: 'Delete test movies?', message: `Delete all ${testMovieCount} test movies? This cannot be undone.`, confirmLabel: 'Delete', danger: true }))) return;

    setDeletingTestMovies(true);
    try {
      await deleteTestMovies();
      setTestMovieCount(0);
      if (onDataRefresh) onDataRefresh();
    } catch (err) {
      console.error('Error deleting test movies:', err);
      showError('Failed to delete test movies');
    } finally {
      setDeletingTestMovies(false);
    }
  };

  return (
    <section className="admin-settings-section">
      <button
        className="admin-settings-toggle"
        onClick={() => setShowAdminSettings(!showAdminSettings)}
      >
        Admin Settings {showAdminSettings ? '\u25B2' : '\u25BC'}
      </button>

      {showAdminSettings && (
        <div className="admin-settings-panel">
          <div className="admin-setting-row">
            <label className="admin-setting-label">Test Mode</label>
            <button
              className={`toggle-btn ${testMode ? 'toggle-on' : 'toggle-off'}`}
              onClick={() => setTestMode(!testMode)}
            >
              {testMode ? 'ON' : 'OFF'}
            </button>
          </div>

          <div className="admin-setting-row">
            <label className="admin-setting-label">Test Channel</label>
            <select
              className="admin-channel-select"
              value={testChannelId}
              onChange={(e) => setTestChannelId(e.target.value)}
              disabled={!testMode}
            >
              <option value="">Select a channel...</option>
              {channels.map((ch) => (
                <option key={ch.channel_id} value={ch.channel_id}>
                  #{ch.channel_name} {ch.parent_name ? `(${ch.parent_name})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="admin-setting-actions">
            <button
              className="btn-primary btn-small"
              onClick={handleSaveSettings}
              disabled={savingSettings}
            >
              {savingSettings ? 'Saving...' : 'Save Settings'}
            </button>

            {testMovieCount > 0 && (
              <button
                className="btn-danger btn-small"
                onClick={handleDeleteTestMovies}
                disabled={deletingTestMovies}
              >
                {deletingTestMovies ? 'Deleting...' : `Delete All Test Movies (${testMovieCount})`}
              </button>
            )}
          </div>

          {testMode && (
            <div className="test-mode-indicator">
              Test mode is active - announcements will go to the test channel and movies will be flagged as test data
            </div>
          )}
        </div>
      )}
    </section>
  );
};

export default AdminSettingsPanel;
