# Elevation
curl "https://api.open-meteo.com/v1/elevation?latitude=17.1616&longitude=78.7201" -o ./openmeteo_rangareddy_elevation.json

# daily
curl "https://archive-api.open-meteo.com/v1/archive?latitude=17.1616&longitude=78.7201&start_date=2026-07-01&end_date=2026-07-04&daily=temperature_2m_max,temperature_2m_min,wind_speed_10m_max,shortwave_radiation_sum,et0_fao_evapotranspiration&timezone=auto" -o ./openmeteo_rangareddy_daily.json

# hourly
curl "https://archive-api.open-meteo.com/v1/archive?latitude=17.1616&longitude=78.7201&start_date=2026-07-01&end_date=2026-07-04&hourly=temperature_2m,wind_speed_10m,relative_humidity_2m&timezone=auto" -o ./openmeteo_rangareddy_hourly_full.json

# humidity hourly
curl "https://archive-api.open-meteo.com/v1/archive?latitude=17.188047&longitude=78.75&start_date=2026-07-01&end_date=2026-07-04&hourly=relative_humidity_2m&timezone=auto" -o ./openmeteo_rangareddy_humidity_hourly.json