import {useLayoutEffect, useRef} from "react";
import * as THREE from 'three'
import random from "canvas-sketch-util/random";
import {Vector3} from "three";

export const Canvas = () => {

    const ref = useRef(null)

    useLayoutEffect(() => {

        if (!ref.current) return;

        const {width, height} = ref.current.getBoundingClientRect()


        const renderer = new THREE.WebGLRenderer({
            canvas: ref.current,
            powerPreference: 'high-performance'
        });

        if (renderer.stencil) renderer.stencil = false
        renderer.shadowMap.enabled = true
        renderer.shadowMap.type = THREE.PCFSoftShadowMap
        renderer.setClearColor('#000', 0)

        const scene = new THREE.Scene();
        const camera = new THREE.OrthographicCamera()
        camera.zoom = 0.2

        const ambient = new THREE.AmbientLight({ color: 'white' })
        ambient.intensity = 2
        scene.add(ambient)

        const light = new THREE.PointLight(0xf9d586, 5.1)
        light.position.set(
            config.position.light.x,
            config.position.light.y,
            config.position.light.z
        )
        scene.add(light)

        const lightGeo = new THREE.SphereBufferGeometry(0.5, 30, 30)
        const lightColor = new THREE.Color(
            `hsl(${config.color.light.h},${config.color.light.s},${config.color.light.l})`
        )
        const lightMat = new THREE.MeshBasicMaterial({ color: lightColor })
        const lightBall = new THREE.Mesh(lightGeo, lightMat)

        scene.add(lightBall)


        const resize = () => {
            // renderer.setPixelRatio(pixelRatio)

            renderer.setSize(width, height, false);
            const aspect = width / height

            // Ortho zoom
            const zoom = 1.0

            // Bounds
            camera.left = -zoom * aspect
            camera.right = zoom * aspect
            camera.top = zoom
            camera.bottom = -zoom

            // Near/Far
            camera.near = -100
            camera.far = 100

            // Set position & look at world center
            camera.position.set(zoom, zoom, zoom)
            camera.lookAt(new THREE.Vector3())

            // Update the camera
            camera.updateProjectionMatrix()
        }

        resize()

        const geometry = new THREE.BoxBufferGeometry()
        const material = new THREE.MeshStandardMaterial({ color: '#222' })

        let nbOfBoxes = random.rangeFloor(
            config.generative.nbBoxes.min,
            config.generative.nbBoxes.max
        )
        let boxData
        let instancedMesh

        const generate = (count) => {
            scene.traverse((obj) => {
                if (obj.name === 'boxes') scene.remove(obj)
            })

            boxData = []
            instancedMesh = new THREE.InstancedMesh(geometry, material, count)
            instancedMesh.name = 'boxes'
            instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)

            for (let index = 0; index < count; index++) {
                const randPos = [
                    random.range(config.generative.minPos, config.generative.maxPos),
                    random.range(config.generative.minPos, config.generative.maxPos),
                    random.range(config.generative.minPos, config.generative.maxPos)
                ]
                const randScale = [
                    random.range(config.generative.minSize, config.generative.maxSize),
                    random.range(config.generative.minSize, config.generative.maxSize),
                    random.range(config.generative.minSize, config.generative.maxSize)
                ]
                const randPosVector = new THREE.Vector3().fromArray(randPos)
                const randScaleVector = new THREE.Vector3().fromArray(randScale)
                const rotVector = new THREE.Quaternion()
                const acceleration = new THREE.Vector3()
                const velocity = randPosVector
                const randMass =
                    (randScaleVector.x + randScaleVector.y + randScaleVector.z) / 3

                boxData.push({
                    origin: randPosVector,
                    baseScale: randScaleVector,
                    baseRot: rotVector,
                    mass: randMass,
                    acceleration: acceleration,
                    velocity: velocity
                })

                const matrix = new THREE.Matrix4()
                matrix.compose(randPosVector, rotVector, randScaleVector)

                instancedMesh.setMatrixAt(index, matrix)
                instancedMesh.instanceMatrix.needsUpdate = true
            }

            scene.add(instancedMesh)
        }

        generate(nbOfBoxes)

        let previousMatrix
        let translation
        let rotation
        let scale

        let directionFromBall
        let massMultiplier
        let distanceMultiplier
        let directionFromOrigin

        let newMatrix

        const moveBox = (i, dt) => {
            previousMatrix = new THREE.Matrix4()
            instancedMesh.getMatrixAt(i, previousMatrix)

            translation = new THREE.Vector3()
            rotation = new THREE.Quaternion()
            scale = new THREE.Vector3()
            previousMatrix.decompose(translation, rotation, scale)

            const distance = translation.distanceTo(lightBall.position)
            boxData[i].velocity = translation

            if (distance <= config.interactive.distanceThreshold) {
                directionFromBall = new Vector3().subVectors(
                    translation,
                    lightBall.position
                ) // direction from light ball

                massMultiplier = 1 / (boxData[i].mass * config.interactive.boxMassFactor) // mass from scale
                distanceMultiplier = (1 / distance) * config.interactive.distanceFactor // inverse distance ("gravity")
                directionFromBall.multiplyScalar(
                    massMultiplier * distanceMultiplier * config.interactive.boxSpeed * dt
                ) // scale direction

                const ballCloned = directionFromBall.clone()
                boxData[i].acceleration.add(ballCloned)
            } else {
                directionFromOrigin = new Vector3().subVectors(
                    boxData[i].origin,
                    translation
                ) // direction from point origin
                directionFromOrigin.multiplyScalar(config.interactive.originFactor) // scale direction
                if (distance <= config.interactive.distanceThreshold + 0.1)
                    directionFromOrigin.multiplyScalar(0) // prevents box flickering

                const originCloned = directionFromOrigin.clone()
                boxData[i].acceleration.add(originCloned)
            }

            boxData[i].velocity.add(boxData[i].acceleration) // add acceleration to velocity - thanks @shiffman
            translation = boxData[i].velocity

            newMatrix = new THREE.Matrix4()
            newMatrix.compose(translation, rotation, scale)
            instancedMesh.setMatrixAt(i, newMatrix)
            instancedMesh.instanceMatrix.needsUpdate = true
            boxData[i].acceleration.multiplyScalar(0)
        }

        config.generative.generate = () => {
            let nbOfBoxes = random.rangeFloor(
                config.generative.nbBoxes.min,
                config.generative.nbBoxes.max
            )
            generate(nbOfBoxes)
        }

        const animate = function () {
            const clock = new THREE.Clock();

            const animate = () => {
                requestAnimationFrame(animate);

                for (let index = 0; index < instancedMesh.count; index++) {
                    moveBox(index, clock.getDelta())
                }


                lightBall.position.set(
                    config.position.light.x,
                    config.position.light.y,
                    config.position.light.z
                )
                light.position.set(
                    config.position.light.x,
                    config.position.light.y,
                    config.position.light.z
                )

                renderer.render(scene, camera);
            }
            animate()
        };


        animate()

        return () => {
            renderer.dispose()
        };

    }, [ref])

    return <canvas id='main-canvas' ref={ref}/>
}

const config = {
    generative: {
        nbBoxes: { min: 3000, max: 4000 },
        minPos: -2.5,
        maxPos: 2.5,
        minSize: 0.08,
        maxSize: 0.13,
        generate: null // generate function is initialized later
    },
    interactive: {
        distanceThreshold: 1.5,
        mouseMovementAmplitude: 6,
        boxMassFactor: 1.2,
        boxSpeed: 0.009,
        boxMaxSpeed: 0.15,
        distanceFactor: 20,
        originFactor: 0.02
    },
    looping: {
        anim: true
    },
    position: {
        light: {
            x: 0,
            y: 0,
            z: 0
        },
        lightBall: {
            x: 0,
            y: 0,
            z: 0
        },
        floor: {
            x: 0,
            y: 0,
            z: 0
        }
    },
    rotation: {
        floor: {
            x: 0,
            y: 0,
            z: 0
        }
    },
    color: {
        light: {
            h: '41',
            s: '91%',
            l: '75%',
            intensity: 2
        }
    },
    performance: {
        measure: false,
        averageFPS: 0,
        fps: 0
    },
    devMode: {
        log: false,
        hideGUI: false
    }
}