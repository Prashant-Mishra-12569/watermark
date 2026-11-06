plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
}

// Session signers each build trusts (interfaces F1), comma-separated addresses from gradle.properties.
fun signers(prop: String): String {
    val list = providers.gradleProperty(prop).get().split(",").map { it.trim() }.filter { it.isNotEmpty() }
    require(list.isNotEmpty() && list.all { Regex("^0x[0-9a-fA-F]{40}$").matches(it) }) { "$prop must list addresses" }
    return list.joinToString(",")
}

// The prover's PUBLIC key ships inside the app. Default: prover/keys/prover_pub.pem (the demo prover).
// For a local dev prover: -Pwatermark.proverKeyPath=/path/to/dev_prover_pub.pem
val proverKeyFile: File = providers.gradleProperty("watermark.proverKeyPath").orNull?.let { file(it) }
    ?: rootProject.file("../prover/keys/prover_pub.pem")
val proverKeyDir = layout.buildDirectory.dir("generated/proverKey")
val copyProverKey = tasks.register<Copy>("copyProverKey") {
    doFirst {
        // Never pack a private key into the app by mistake
        val text = proverKeyFile.readText()
        require(text.trimStart().startsWith("-----BEGIN PUBLIC KEY-----") && !text.contains("PRIVATE")) {
            "$proverKeyFile is not a PUBLIC key"
        }
    }
    from(proverKeyFile)
    rename { "prover_pub.pem" }
    into(proverKeyDir)
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
        // Debug builds trust the public dev signer AND the real relayer signer; see buildTypes for the others
        buildConfigField("String", "SESSION_SIGNERS", "\"${signers("watermark.sessionSigners.debug")}\"")
        // true only in the mirrored demo build: lets scrcpy show the tap screen (FLAG_SECURE off)
        buildConfigField("boolean", "DEMO_MIRROR", "false")
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            buildConfigField("String", "SESSION_SIGNERS", "\"${signers("watermark.sessionSigners.real")}\"")
        }
        // The stage build: only the real relayer signer, and screen mirroring allowed
        create("demo") {
            initWith(getByName("debug"))
            applicationIdSuffix = ".demo"
            buildConfigField("boolean", "DEMO_MIRROR", "true")
            buildConfigField("String", "SESSION_SIGNERS", "\"${signers("watermark.sessionSigners.real")}\"")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    // Only the copied public key, never the whole folder
    sourceSets["main"].assets.srcDir(proverKeyDir)

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
    implementation(libs.bouncycastle)
    debugImplementation(libs.androidx.ui.tooling)
    testImplementation(libs.junit)
}

tasks.named("preBuild") { dependsOn(copyProverKey) }
