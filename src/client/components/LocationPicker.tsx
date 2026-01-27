import { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import { Button, Form, Input, Space } from 'antd-mobile';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet icon issue
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface Props {
  value?: { lat: number; lng: number };
  defaultValue?: { lat: number; lng: number };
  onChange: (val: { lat: number; lng: number }) => void;
}

const LocationMarker = ({ position, onChange }: { position: L.LatLng, onChange: (pos: L.LatLng) => void }) => {
  const map = useMapEvents({
    click(e) {
      onChange(e.latlng);
      map.flyTo(e.latlng, map.getZoom());
    },
  });

  return position ? <Marker position={position} /> : null;
};

export default function LocationPicker({ value, defaultValue, onChange }: Props) {
  const [pos, setPos] = useState<L.LatLng | null>(null);
  const mapRef = useRef<L.Map>(null);

  useEffect(() => {
    if (value) {
      setPos(new L.LatLng(value.lat, value.lng));
    } else if (defaultValue) {
        setPos(new L.LatLng(defaultValue.lat, defaultValue.lng));
        onChange(defaultValue);
    }
  }, []); // Init only

  useEffect(() => {
      if (value && (!pos || value.lat !== pos.lat || value.lng !== pos.lng)) {
          setPos(new L.LatLng(value.lat, value.lng));
          if (mapRef.current) {
              mapRef.current.flyTo([value.lat, value.lng], 15);
          }
      }
  }, [value]);

  const handleMapClick = (newPos: L.LatLng) => {
    setPos(newPos);
    onChange({ lat: newPos.lat, lng: newPos.lng });
  };

  const handleReset = () => {
      if (defaultValue) {
          const newPos = new L.LatLng(defaultValue.lat, defaultValue.lng);
          handleMapClick(newPos);
          if (mapRef.current) {
              mapRef.current.flyTo([defaultValue.lat, defaultValue.lng], 15);
          }
      }
  };

  const handleCurrentLocation = () => {
      if (!navigator.geolocation) {
          alert('Geolocation is not supported by your browser');
          return;
      }
      navigator.geolocation.getCurrentPosition(
          (position) => {
              const { latitude, longitude } = position.coords;
              const newPos = new L.LatLng(latitude, longitude);
              handleMapClick(newPos);
              if (mapRef.current) {
                  mapRef.current.flyTo([latitude, longitude], 15);
              }
          },
          () => {
              alert('Unable to retrieve your location');
          }
      );
  };

  const handleInputChange = (key: 'lat' | 'lng', val: string) => {
      const num = parseFloat(val);
      if (!isNaN(num) && pos) {
          const newPos = key === 'lat' ? new L.LatLng(num, pos.lng) : new L.LatLng(pos.lat, num);
          handleMapClick(newPos);
      }
  };

  if (!pos) return <div>Loading Map...</div>;

  return (
    <div>
      <div style={{ height: '250px', marginBottom: 10, borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(0, 0, 0, 0.12)' }}>
        <MapContainer 
            center={pos} 
            zoom={15} 
            style={{ height: '100%', width: '100%' }}
            ref={mapRef}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <LocationMarker position={pos} onChange={handleMapClick} />
        </MapContainer>
      </div>

      <Space align='center' style={{ marginBottom: 10 }}>
        <Button size='mini' fill='outline' onClick={handleReset}>公司預設</Button>
        <Button size='mini' fill='outline' onClick={handleCurrentLocation}>目前位置</Button>
      </Space>

      <Form.Item label='經度 (Lng)'>
        <Input 
            type='number' 
            value={pos.lng.toString()} 
            onChange={v => handleInputChange('lng', v)} 
        />
      </Form.Item>
      <Form.Item label='緯度 (Lat)'>
        <Input 
            type='number' 
            value={pos.lat.toString()} 
            onChange={v => handleInputChange('lat', v)} 
        />
      </Form.Item>
    </div>
  );
}
