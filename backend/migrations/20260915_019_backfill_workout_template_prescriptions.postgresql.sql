-- Templates created before structured prescriptions existed retain their
-- legacy distance or duration as a one-step prescription.
UPDATE workout_templates
SET prescription_json = CASE
  WHEN default_distance IS NOT NULL AND default_distance > 0 THEN
    json_build_object(
      'blocks',
      json_build_array(
        json_build_object(
          'kind', 'step',
          'role', 'other',
          'extent', 'distance',
          'distance_meters', default_distance * 1609.344,
          'display_unit', 'mi'
        )
      )
    )
  WHEN default_duration IS NOT NULL AND default_duration > 0 THEN
    json_build_object(
      'blocks',
      json_build_array(
        json_build_object(
          'kind', 'step',
          'role', 'other',
          'extent', 'duration',
          'duration_seconds', default_duration,
          'display_unit', 'sec'
        )
      )
    )
  ELSE
    json_build_object(
      'blocks',
      json_build_array(json_build_object('kind', 'step', 'role', 'other', 'extent', 'open'))
    )
END
WHERE prescription_json IS NULL;

ALTER TABLE workout_templates ALTER COLUMN prescription_json SET NOT NULL;
