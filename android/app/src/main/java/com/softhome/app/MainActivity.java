package com.softhome.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.view.View;
import android.graphics.Color;
import android.os.Build;
import android.webkit.JavascriptInterface;
import androidx.core.view.WindowInsetsControllerCompat;
import android.content.ClipData;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import android.provider.MediaStore;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.Toast;
import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AlertDialog;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewClientCompat;
import java.io.File;
import java.io.IOException;

public class MainActivity extends AppCompatActivity {
    private WebView webView;
    private ValueCallback<Uri[]> uploadMessage;
    private Uri cameraUri;
    private File cameraFile;

    private final ActivityResultLauncher<String> galleryPicker = registerForActivityResult(
            new ActivityResultContracts.GetContent(), uri -> finishUpload(uri));

    private final ActivityResultLauncher<Intent> cameraPicker = registerForActivityResult(
            new ActivityResultContracts.StartActivityForResult(), result -> {
                Uri resultUri = result.getResultCode() == Activity.RESULT_OK
                        && cameraFile != null && cameraFile.length() > 0 ? cameraUri : null;
                if (resultUri == null) discardCameraFile();
                finishUpload(resultUri);
                cameraUri = null;
                cameraFile = null;
            });

    private final ActivityResultLauncher<String> cameraPermission = registerForActivityResult(
            new ActivityResultContracts.RequestPermission(), granted -> {
                if (granted) openCamera();
                else {
                    Toast.makeText(this, "Kamera izni verilmedi. Fotoğrafı galeriden seçebilirsin.", Toast.LENGTH_LONG).show();
                    finishUpload(null);
                }
            });

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);
        webView = findViewById(R.id.webview);
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        applySystemTheme(getSharedPreferences("appearance", MODE_PRIVATE).getString("theme", "light"));
        webView.addJavascriptInterface(new AppearanceBridge(), "SoftHomeNative");
        cleanOldPhotos();

        final WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();
        WebSettings webSettings = webView.getSettings();
        webSettings.setJavaScriptEnabled(true);
        webSettings.setDomStorageEnabled(true);
        webSettings.setDatabaseEnabled(true);
        webSettings.setAllowFileAccess(false);
        webSettings.setAllowContentAccess(true);
        webSettings.setMediaPlaybackRequiresUserGesture(false);
        webSettings.setLoadWithOverviewMode(true);
        webSettings.setUseWideViewPort(true);
        webView.setWebViewClient(new WebViewClientCompat() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return assetLoader.shouldInterceptRequest(request.getUrl());
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                                             FileChooserParams params) {
                finishUpload(null);
                uploadMessage = callback;
                if (params.isCaptureEnabled()) requestCamera();
                else new AlertDialog.Builder(MainActivity.this)
                        .setTitle("Fatura fotoğrafı")
                        .setItems(new String[]{"Kamerayla çek", "Galeriden seç"}, (dialog, index) -> {
                            if (index == 0) requestCamera();
                            else openGallery();
                        })
                        .setOnCancelListener(dialog -> finishUpload(null))
                        .show();
                return true;
            }
        });
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (webView.canGoBack()) webView.goBack();
                else {
                    setEnabled(false);
                    getOnBackPressedDispatcher().onBackPressed();
                    setEnabled(true);
                }
            }
        });
        webView.loadUrl(BuildConfig.SOFT_HOME_URL.isEmpty()
                ? "https://appassets.androidplatform.net/assets/index.html" : BuildConfig.SOFT_HOME_URL);
    }

    private void applySystemTheme(String theme) {
        boolean dark = "dark".equals(theme);
        int background = Color.parseColor(dark ? "#17231e" : "#f4f6f2");
        int navigation = Color.parseColor(dark ? "#21312a" : "#fbfcfa");
        getWindow().setStatusBarColor(background);
        getWindow().setNavigationBarColor(navigation);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            getWindow().setNavigationBarContrastEnforced(false);
            getWindow().setStatusBarContrastEnforced(false);
        }
        WindowInsetsControllerCompat controller = new WindowInsetsControllerCompat(getWindow(), getWindow().getDecorView());
        controller.setAppearanceLightStatusBars(!dark);
        controller.setAppearanceLightNavigationBars(!dark);
        if (webView != null) webView.setBackgroundColor(background);
    }

    public final class AppearanceBridge {
        @JavascriptInterface
        public void setTheme(String theme) {
            if (!"dark".equals(theme) && !"light".equals(theme)) return;
            runOnUiThread(() -> {
                applySystemTheme(theme);
                if (!theme.equals(getSharedPreferences("appearance", MODE_PRIVATE).getString("theme", "light")))
                    getSharedPreferences("appearance", MODE_PRIVATE).edit().putString("theme", theme).apply();
            });
        }
    }

    private void requestCamera() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
                == PackageManager.PERMISSION_GRANTED) openCamera();
        else cameraPermission.launch(Manifest.permission.CAMERA);
    }

    private void openGallery() {
        try { galleryPicker.launch("image/*"); }
        catch (RuntimeException error) {
            Toast.makeText(this, "Fotoğraf seçici açılamadı.", Toast.LENGTH_LONG).show();
            finishUpload(null);
        }
    }

    private void openCamera() {
        try {
            File directory = new File(getCacheDir(), "receipts");
            if (!directory.isDirectory() && !directory.mkdirs()) throw new IOException("Photo cache unavailable");
            cameraFile = File.createTempFile("receipt-", ".jpg", directory);
            cameraUri = FileProvider.getUriForFile(this, getPackageName() + ".files", cameraFile);
            Intent intent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
            intent.putExtra(MediaStore.EXTRA_OUTPUT, cameraUri);
            intent.setClipData(ClipData.newRawUri("receipt", cameraUri));
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            cameraPicker.launch(intent);
        } catch (IOException | RuntimeException error) {
            discardCameraFile();
            Toast.makeText(this, "Kamera açılamadı. Fotoğrafı galeriden seçebilirsin.", Toast.LENGTH_LONG).show();
            finishUpload(null);
        }
    }

    private void finishUpload(Uri uri) {
        ValueCallback<Uri[]> callback = uploadMessage;
        uploadMessage = null;
        if (callback != null) callback.onReceiveValue(uri == null ? null : new Uri[]{uri});
    }

    private void discardCameraFile() {
        if (cameraFile != null) cameraFile.delete();
        cameraFile = null;
        cameraUri = null;
    }

    private void cleanOldPhotos() {
        File[] photos = new File(getCacheDir(), "receipts").listFiles();
        if (photos == null) return;
        long cutoff = System.currentTimeMillis() - 24L * 60 * 60 * 1000;
        for (File photo : photos) if (photo.isFile() && photo.lastModified() < cutoff) photo.delete();
    }

    @Override
    protected void onDestroy() {
        finishUpload(null);
        super.onDestroy();
    }
}
