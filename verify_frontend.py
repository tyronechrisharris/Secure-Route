import time
import urllib.request
import urllib.parse
import json

def verify():
    # Wait for server
    print("Waiting for server to be ready...")
    for i in range(30):
        try:
            with urllib.request.urlopen("http://localhost:8080") as response:
                if response.status == 200:
                    print("Server is up!")
                    break
        except Exception as e:
            time.sleep(2)
            if i % 5 == 0:
                print(f"Still waiting... ({e})")

    # Verify assets endpoint
    print("\nVerifying /api/security-assets...")
    try:
        with urllib.request.urlopen("http://localhost:8080/api/security-assets") as response:
            if response.status == 200:
                data = json.loads(response.read().decode())
                if len(data) > 0:
                    print(f"Assets endpoint working: OK (Found {len(data)} assets)")
                else:
                    print("Assets endpoint working but returned 0 assets.")
            else:
                print(f"Assets endpoint failed: {response.status}")
    except Exception as e:
        print(f"Assets endpoint error: {e}")

    # Verify routing endpoint
    print("\nVerifying /api/secure-route...")
    payload = {
        "route_points": [
            [51.5074, -0.1278],
            [51.5150, -0.1100]
        ],
        "threat_polygons": [],
        "threatLevel": "LOW",
        "vehicleProfile": "security_car"
    }

    try:
        req = urllib.request.Request("http://localhost:8080/api/secure-route")
        req.add_header('Content-Type', 'application/json')
        jsondata = json.dumps(payload).encode('utf-8')
        req.add_header('Content-Length', len(jsondata))

        with urllib.request.urlopen(req, jsondata) as response:
            if response.status == 200:
                data = json.loads(response.read().decode())
                if "geometry" in data and "coordinates" in data["geometry"]:
                     print("Routing endpoint working: OK")
                     print(f"Distance: {data['distance']} meters")
                     print(f"Time: {data['time']} ms")
                     print(f"Threat Intersected: {data.get('threat_intersected')}")
                else:
                     print(f"Routing endpoint response invalid: {data}")
            else:
                print(f"Routing endpoint failed: {response.status}")
    except Exception as e:
        print(f"Routing endpoint error: {e}")

if __name__ == "__main__":
    verify()
