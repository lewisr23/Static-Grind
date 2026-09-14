package com.staticgrind.app;

import android.Manifest;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;

import androidx.annotation.RequiresApi;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;

/**
 * Puts a finished snap or recording straight into the device gallery.
 *
 * Capacitor has no first-party plugin for this. Sharing the file instead is the
 * usual workaround and it is the wrong shape for this app: hitting Snap is a
 * save, not a hand-off, and answering a share sheet every time is a chore
 * between the user and the picture they just made.
 *
 * The file arrives as a uri rather than base64. It is already on disk by the
 * time this runs, written to the cache directory by Filesystem, so streaming it
 * across avoids putting a whole video through the bridge a second time.
 */
@CapacitorPlugin(
    name = "MediaSaver",
    permissions = {
        @Permission(alias = MediaSaverPlugin.STORAGE, strings = { Manifest.permission.WRITE_EXTERNAL_STORAGE })
    }
)
public class MediaSaverPlugin extends Plugin {

    static final String STORAGE = "storage";

    /** Both gallery folders carry the app name, so its output stays one album. */
    private static final String ALBUM = "Static Grind";

    @PluginMethod
    public void save(PluginCall call) {
        // Android 10 opened MediaStore to any app for its own files, so on
        // anything current this needs no permission at all and never prompts.
        // Below that, writing to a public directory is a runtime permission.
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q
                && getPermissionState(STORAGE) != PermissionState.GRANTED) {
            requestPermissionForAlias(STORAGE, call, "storagePermission");
            return;
        }
        write(call);
    }

    @PermissionCallback
    private void storagePermission(PluginCall call) {
        if (getPermissionState(STORAGE) != PermissionState.GRANTED) {
            call.reject("Static Grind needs permission to save to your gallery.", "denied");
            return;
        }
        write(call);
    }

    private void write(PluginCall call) {
        String source = call.getString("uri");
        String filename = call.getString("filename");
        String mimeType = call.getString("mimeType", "application/octet-stream");

        if (source == null || filename == null) {
            call.reject("uri and filename are both required");
            return;
        }

        boolean isVideo = mimeType.startsWith("video/");

        try {
            Uri saved = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
                    ? insertViaMediaStore(Uri.parse(source), filename, mimeType, isVideo)
                    : insertViaPublicDirectory(Uri.parse(source), filename, isVideo);

            JSObject result = new JSObject();
            result.put("uri", saved.toString());
            result.put("album", ALBUM);
            call.resolve(result);
        } catch (Exception err) {
            call.reject("Could not save to the gallery: " + err.getMessage(), err);
        }
    }

    /**
     * IS_PENDING is what keeps a half-copied video out of the gallery: the row
     * exists from the first insert, and gallery apps ignore it until the flag
     * comes back off. Without it a long recording shows up as a broken
     * thumbnail while it is still being written.
     */
    @RequiresApi(Build.VERSION_CODES.Q)
    private Uri insertViaMediaStore(Uri source, String filename, String mimeType, boolean isVideo)
            throws Exception {
        ContentResolver resolver = getContext().getContentResolver();

        Uri collection = isVideo
                ? MediaStore.Video.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
                : MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY);

        String folder = (isVideo ? Environment.DIRECTORY_MOVIES : Environment.DIRECTORY_PICTURES)
                + File.separator + ALBUM;

        ContentValues values = new ContentValues();
        values.put(MediaStore.MediaColumns.DISPLAY_NAME, filename);
        values.put(MediaStore.MediaColumns.MIME_TYPE, mimeType);
        values.put(MediaStore.MediaColumns.RELATIVE_PATH, folder);
        values.put(MediaStore.MediaColumns.IS_PENDING, 1);

        Uri item = resolver.insert(collection, values);
        if (item == null) throw new Exception("MediaStore would not take the file");

        try (InputStream in = resolver.openInputStream(source);
             OutputStream out = resolver.openOutputStream(item)) {
            if (in == null || out == null) throw new Exception("Could not open the file for copying");
            copy(in, out);
        } catch (Exception err) {
            // Leaving the pending row behind would be an invisible file the
            // user can never see or delete.
            resolver.delete(item, null, null);
            throw err;
        }

        values.clear();
        values.put(MediaStore.MediaColumns.IS_PENDING, 0);
        resolver.update(item, values, null, null);

        return item;
    }

    /** Android 9 and older: a real file in a public folder, then a scan. */
    private Uri insertViaPublicDirectory(Uri source, String filename, boolean isVideo) throws Exception {
        File dir = new File(
                Environment.getExternalStoragePublicDirectory(
                        isVideo ? Environment.DIRECTORY_MOVIES : Environment.DIRECTORY_PICTURES),
                ALBUM);

        if (!dir.exists() && !dir.mkdirs()) throw new Exception("Could not create " + dir);

        File target = new File(dir, filename);

        try (InputStream in = getContext().getContentResolver().openInputStream(source);
             OutputStream out = new FileOutputStream(target)) {
            if (in == null) throw new Exception("Could not open the file for copying");
            copy(in, out);
        }

        // The file is on disk either way, but until the media scanner sees it
        // no gallery app knows it exists, which can otherwise take hours.
        MediaScannerConnection.scanFile(
                getContext(), new String[] { target.getAbsolutePath() }, null, null);

        return Uri.fromFile(target);
    }

    private void copy(InputStream in, OutputStream out) throws Exception {
        byte[] buffer = new byte[8192];
        int read;
        while ((read = in.read(buffer)) != -1) {
            out.write(buffer, 0, read);
        }
        out.flush();
    }
}
