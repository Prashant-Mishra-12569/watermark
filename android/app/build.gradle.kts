plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
}

android {
    namespace = "com.watermark.tap"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.watermark.tap"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"
        // Session signer address allowed by this build (interfaces F1). Set before the demo.
        buildConfigField("String", "SESSION_SIGNER_ADDRESS", "\"0x0000000000000000000000000000000000000000\"")
        // true only in the mirrored demo build: lets scrcpy show the tap screen (FLAG_SECURE off)
        buildConfigField("boolean", "DEMO_MIRROR", "false")
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
        create("demo") {
            initWith(getByName("debug"))
            applicationIdSuffix = ".demo"
            buildConfigField("boolean", "DEMO_MIRROR", "true")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    buildFeatures {
        compose = true
        buildConfig = true
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.ui)
    implementation(libs.androidx.ui.graphics)
    implementation(libs.androidx.ui.tooling.preview)
    implementation(libs.androidx.material3)
    debugImplementation(libs.androidx.ui.tooling)
    testImplementation(libs.junit)
}
