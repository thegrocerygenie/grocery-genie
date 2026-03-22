import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { CameraViewComponent } from '@/features/receipt-capture/components/CameraView';
import { ImagePreview } from '@/features/receipt-capture/components/ImagePreview';
import { useReceiptScan } from '@/features/receipt-capture/hooks/useReceiptScan';
import type { ScanState } from '@/features/receipt-capture/types';
import { useAnalytics } from '@/hooks/useAnalytics';
import { useReceiptStore } from '@/store/receiptStore';

export default function ScanScreen() {
  const [scanState, setScanState] = useState<ScanState>('camera');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState('image/jpeg');
  const [warnings, setWarnings] = useState<
    { type: 'blur' | 'low_light' | 'resolution'; message: string }[]
  >([]);

  const scanMutation = useReceiptScan();
  const { setCapturedImageUri, setActiveScanResponse } = useReceiptStore();
  const analytics = useAnalytics();

  const handleCapture = useCallback((uri: string) => {
    analytics.emit('receipt_scan_started', { source: 'camera' });
    setImageUri(uri);
    setMimeType('image/jpeg');
    setWarnings([]); // Quality analysis would happen here client-side in future
    setScanState('preview');
  }, [analytics]);

  const handlePickFromLibrary = useCallback((uri: string, type: string) => {
    analytics.emit('receipt_scan_started', { source: 'library' });
    setImageUri(uri);
    setMimeType(type);
    setWarnings([]);
    setScanState('preview');
  }, [analytics]);

  const handleRetake = useCallback(() => {
    setImageUri(null);
    setWarnings([]);
    setScanState('camera');
  }, []);

  const handleUsePhoto = useCallback(async () => {
    if (!imageUri) return;

    setScanState('uploading');
    scanMutation.mutate(
      { imageUri, mimeType },
      {
        onSuccess: (response) => {
          setCapturedImageUri(imageUri);
          setActiveScanResponse(response);
          setScanState('camera');
          setImageUri(null);
          router.push('/review');
        },
        onError: (error) => {
          setScanState('preview');
          Alert.alert('Scan Failed', error.message, [{ text: 'OK' }]);
        },
      },
    );
  }, [imageUri, mimeType, scanMutation, setCapturedImageUri, setActiveScanResponse]);

  if ((scanState === 'preview' || scanState === 'uploading') && imageUri) {
    return (
      <ImagePreview
        uri={imageUri}
        onRetake={handleRetake}
        onUsePhoto={handleUsePhoto}
        warnings={warnings}
        loading={scanState === 'uploading'}
      />
    );
  }

  return (
    <View style={styles.container}>
      <CameraViewComponent onCapture={handleCapture} onPickFromLibrary={handlePickFromLibrary} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
