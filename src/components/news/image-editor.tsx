'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Loader2, Crop, Save, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { proxyImageUrl } from '@/lib/format';

type Props = {
  open: boolean;
  onClose: () => void;
  imageUrl: string;
  title?: string;
  onSave: (newUrl: string) => void;
  token: string;
};

type CropRect = { x: number; y: number; w: number; h: number };

export function ImageEditor({ open, onClose, imageUrl, title, onSave, token }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [crop, setCrop] = useState<CropRect | null>(null);
  const draggingRef = useRef(false);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const drawCanvas = useCallback((newCrop?: CropRect | null) => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Canvas boyutu — maks 700x500, aspect ratio'yu koru, zoom uygula
    const baseW = 700;
    const baseH = 500;
    const aspectRatio = img.naturalWidth / img.naturalHeight;
    let canvasW = baseW * zoom;
    let canvasH = canvasW / aspectRatio;
    if (canvasH > baseH * zoom) {
      canvasH = baseH * zoom;
      canvasW = canvasH * aspectRatio;
    }
    canvas.width = canvasW;
    canvas.height = canvasH;

    // Görseli çiz
    ctx.drawImage(img, 0, 0, canvasW, canvasH);

    // Crop overlay
    const c = newCrop !== undefined ? newCrop : crop;
    if (c && c.w > 0 && c.h > 0) {
      // Karartma — crop dışı alan
      ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
      ctx.fillRect(0, 0, canvasW, canvasH);

      // Crop bölgesini temizle ve görseli tekrar çiz
      ctx.save();
      ctx.beginPath();
      ctx.rect(c.x, c.y, c.w, c.h);
      ctx.clip();
      ctx.drawImage(img, 0, 0, canvasW, canvasH);
      ctx.restore();

      // Crop çerçevesi
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 2;
      ctx.strokeRect(c.x, c.y, c.w, c.h);

      // Köşe handle'ları (görsel ipucu)
      const handleSize = 8;
      ctx.fillStyle = '#3b82f6';
      // 4 köşe
      [
        [c.x, c.y],
        [c.x + c.w, c.y],
        [c.x, c.y + c.h],
        [c.x + c.w, c.y + c.h],
      ].forEach(([hx, hy]) => {
        ctx.fillRect(hx - handleSize / 2, hy - handleSize / 2, handleSize, handleSize);
      });
    }
  }, [crop, zoom]);

  // Görseli yükle
  useEffect(() => {
    if (!open || !imageUrl) return;
    setImgLoaded(false);
    setCrop(null);
    setErrorMsg(null);
    setZoom(1);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      imgRef.current = img;
      setImgLoaded(true);
      // Draw after state update
      setTimeout(() => drawCanvas(null), 50);
    };
    img.onerror = () => {
      setErrorMsg('Görsel yüklenemedi — URL geçersiz veya erişilemiyor');
      setImgLoaded(false);
    };
    // Dış URL'leri proxy üzerinden al — CORS engeller
    img.src = proxyImageUrl(imageUrl) || imageUrl;
  }, [open, imageUrl, drawCanvas]);

  // Yeniden çiz
  useEffect(() => {
    if (imgLoaded) drawCanvas();
  }, [imgLoaded, zoom, drawCanvas]);

  const getCanvasPos = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const onMouseDown = (e: React.MouseEvent) => {
    const pos = getCanvasPos(e);
    draggingRef.current = true;
    dragStartRef.current = pos;
    const newCrop: CropRect = { x: pos.x, y: pos.y, w: 0, h: 0 };
    setCrop(newCrop);
    drawCanvas(newCrop);
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (!draggingRef.current) return;
    const pos = getCanvasPos(e);
    const start = dragStartRef.current;
    if (!start) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const newCrop: CropRect = {
      x: Math.min(start.x, pos.x),
      y: Math.min(start.y, pos.y),
      w: Math.abs(pos.x - start.x),
      h: Math.abs(pos.y - start.y),
    };
    setCrop(newCrop);
    drawCanvas(newCrop);
  };

  const onMouseUp = () => {
    draggingRef.current = false;
    dragStartRef.current = null;
  };

  const handleReset = () => {
    setCrop(null);
    drawCanvas(null);
  };

  const handleZoomIn = () => setZoom(z => Math.min(2, z + 0.25));
  const handleZoomOut = () => setZoom(z => Math.max(0.5, z - 0.25));

  const handleCropAndSave = async () => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img || !crop || crop.w < 10 || crop.h < 10) {
      toast.error('Lütfen geçerli bir kırpma alanı seçin (en az 10x10 px)');
      return;
    }
    setSaving(true);
    try {
      // Canvas koordinatlarını orijinal görsel koordinatlarına çevir
      const scaleX = img.naturalWidth / canvas.width;
      const scaleY = img.naturalHeight / canvas.height;
      const srcX = Math.max(0, crop.x * scaleX);
      const srcY = Math.max(0, crop.y * scaleY);
      const srcW = Math.max(1, crop.w * scaleX);
      const srcH = Math.max(1, crop.h * scaleY);

      // Yeni canvas — kırpılan bölgeyi çiz
      const newCanvas = document.createElement('canvas');
      newCanvas.width = Math.round(srcW);
      newCanvas.height = Math.round(srcH);
      const ctx = newCanvas.getContext('2d');
      if (!ctx) throw new Error('Canvas hatası');
      ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, srcW, srcH);

      // Blob'a çevir (JPEG kalite 0.92)
      const blob = await new Promise<Blob | null>((resolve) =>
        newCanvas.toBlob(resolve, 'image/jpeg', 0.92)
      );
      if (!blob) throw new Error('Blob oluşturulamadı');

      // File oluştur
      const file = new File([blob], 'crop.jpg', { type: 'image/jpeg' });

      // Upload — backend /api/admin/upload POST
      const formData = new FormData();
      formData.append('file', file);
      const uploadUrl = `/api/admin/upload${title ? `?title=${encodeURIComponent(title)}` : ''}`;
      const r = await fetch(uploadUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const json = (await r.json()) as { ok?: boolean; url?: string; error?: string };
      if (!r.ok || !json.ok) throw new Error(json.error || 'Yükleme hatası');

      onSave(json.url!);
      toast.success('Görsel kırpıldı ve kaydedildi');
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Hata';
      toast.error(msg);
      console.error('[ImageEditor] Hata:', e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Crop className="h-4 w-4" /> Görseli Kırp — Düzenle</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Mouse ile kırpma alanı seçin (tıkla ve sürükle). Seçilen alan dışı karanlık gösterilir. "Kırp ve Kaydet" ile yeni görsel oluşturulur ve özel haber görseli olarak ayarlanır.
          </p>
          <div className="flex items-center gap-1.5">
            <Button type="button" variant="outline" size="sm" onClick={handleZoomOut} disabled={!imgLoaded} className="gap-1.5 h-7"><ZoomOut className="h-3.5 w-3.5" /></Button>
            <span className="text-[10px] text-muted-foreground tabular-nums w-10 text-center">{Math.round(zoom * 100)}%</span>
            <Button type="button" variant="outline" size="sm" onClick={handleZoomIn} disabled={!imgLoaded} className="gap-1.5 h-7"><ZoomIn className="h-3.5 w-3.5" /></Button>
            <div className="ml-auto flex items-center gap-2">
              {crop && crop.w > 0 && crop.h > 0 && (
                <span className="text-[10px] text-muted-foreground">Seçili: {Math.round(crop.w)} × {Math.round(crop.h)}px</span>
              )}
            </div>
          </div>
          <div className="flex justify-center bg-muted/30 rounded-md p-2 min-h-[300px] items-center">
            <canvas
              ref={canvasRef}
              onMouseDown={onMouseDown}
              onMouseMove={onMouseMove}
              onMouseUp={onMouseUp}
              onMouseLeave={onMouseUp}
              className="cursor-crosshair max-w-full"
              style={{ display: imgLoaded ? 'block' : 'none' }}
            />
            {!imgLoaded && !errorMsg && <Loader2 className="h-6 w-6 animate-spin" />}
            {errorMsg && <p className="text-xs text-destructive">{errorMsg}</p>}
          </div>
        </div>
        <div className="flex justify-between gap-2 pt-2 border-t">
          <Button type="button" variant="outline" size="sm" onClick={handleReset} disabled={!imgLoaded || !crop} className="gap-1.5">
            <RotateCcw className="h-3.5 w-3.5" />
            Seçimi Sıfırla
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>İptal</Button>
            <Button
              type="button"
              size="sm"
              onClick={handleCropAndSave}
              disabled={saving || !imgLoaded || !crop || crop.w < 10 || crop.h < 10}
              className="gap-1.5 bg-blue-600 hover:bg-blue-700"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Kırp ve Kaydet
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
