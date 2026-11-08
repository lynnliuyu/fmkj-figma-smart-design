import * as migration_20261029_075429_initial from './20261029_075429_initial';
import * as migration_20261030_115036_dual_sync from './20261030_115036_dual_sync';
import * as migration_20261030_173534_mp_sync from './20261030_173534_mp_sync';
import * as migration_20261031_061256_latest_feature_sync from './20261031_061256_latest_feature_sync';
import * as migration_20261031_065532_ai_admin_sync from './20261031_065532_ai_admin_sync';
import * as migration_20261031_114930_personal_profile_demo from './20261031_114930_personal_profile_demo';
import * as migration_20261031_161835_membership_codes from './20261031_161835_membership_codes';
import * as migration_20261101_172228_ai_settings_sync from './20261101_172228_ai_settings_sync';
import * as migration_20261102_081320_scenes_templates_delivery_sync from './20261102_081320_scenes_templates_delivery_sync';
import * as migration_20261102_140755_model_pricing from './20261102_140755_model_pricing';
import * as migration_20261103_120000_templates_meta_and_ai_min_tier from './20261103_120000_templates_meta_and_ai_min_tier';
import * as migration_20261104_032108_after_sales_feedback_costs from './20261104_032108_after_sales_feedback_costs';
import * as migration_20261108_012324_20261108_remove_membership_tiers from './20261108_012324_20261108_remove_membership_tiers';

export const migrations = [
  {
    up: migration_20261029_075429_initial.up,
    down: migration_20261029_075429_initial.down,
    name: '20261029_075429_initial',
  },
  {
    up: migration_20261030_115036_dual_sync.up,
    down: migration_20261030_115036_dual_sync.down,
    name: '20261030_115036_dual_sync',
  },
  {
    up: migration_20261030_173534_mp_sync.up,
    down: migration_20261030_173534_mp_sync.down,
    name: '20261030_173534_mp_sync',
  },
  {
    up: migration_20261031_061256_latest_feature_sync.up,
    down: migration_20261031_061256_latest_feature_sync.down,
    name: '20261031_061256_latest_feature_sync',
  },
  {
    up: migration_20261031_065532_ai_admin_sync.up,
    down: migration_20261031_065532_ai_admin_sync.down,
    name: '20261031_065532_ai_admin_sync',
  },
  {
    up: migration_20261031_114930_personal_profile_demo.up,
    down: migration_20261031_114930_personal_profile_demo.down,
    name: '20261031_114930_personal_profile_demo',
  },
  {
    up: migration_20261031_161835_membership_codes.up,
    down: migration_20261031_161835_membership_codes.down,
    name: '20261031_161835_membership_codes',
  },
  {
    up: migration_20261101_172228_ai_settings_sync.up,
    down: migration_20261101_172228_ai_settings_sync.down,
    name: '20261101_172228_ai_settings_sync',
  },
  {
    up: migration_20261102_081320_scenes_templates_delivery_sync.up,
    down: migration_20261102_081320_scenes_templates_delivery_sync.down,
    name: '20261102_081320_scenes_templates_delivery_sync',
  },
  {
    up: migration_20261102_140755_model_pricing.up,
    down: migration_20261102_140755_model_pricing.down,
    name: '20261102_140755_model_pricing',
  },
  {
    up: migration_20261103_120000_templates_meta_and_ai_min_tier.up,
    down: migration_20261103_120000_templates_meta_and_ai_min_tier.down,
    name: '20261103_120000_templates_meta_and_ai_min_tier',
  },
  {
    up: migration_20261104_032108_after_sales_feedback_costs.up,
    down: migration_20261104_032108_after_sales_feedback_costs.down,
    name: '20261104_032108_after_sales_feedback_costs',
  },
  {
    up: migration_20261108_012324_20261108_remove_membership_tiers.up,
    down: migration_20261108_012324_20261108_remove_membership_tiers.down,
    name: '20261108_012324_20261108_remove_membership_tiers'
  },
];
